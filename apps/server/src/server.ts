import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ClaimSchema,
  ClientMessageSchema,
  LoginSchema,
  MATCH_VARIANTS,
  type MatchVariantId,
  NameSchema,
  PasswordChangeSchema,
  type ServerMessage,
} from "@tavli/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { AccountError, Store } from "./db";
import { type FairPlayOptions, Lobby, type MatchmakingOptions } from "./lobby";
import type { Conn, RoomTimings } from "./room";

export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly dbPath: string;
  /** Allowed browser origins for REST calls ("*" = any). */
  readonly corsOrigin?: string;
  readonly timings?: Partial<RoomTimings>;
  readonly randomSeats?: boolean;
  readonly matchmaking?: Partial<MatchmakingOptions>;
  readonly fairPlay?: Partial<FairPlayOptions>;
  /** Per-connection message limit (token bucket). */
  readonly messageRate?: { readonly perSecond: number; readonly burst: number };
  /** Behind a reverse proxy: take the client address from X-Forwarded-For. */
  readonly trustProxy?: boolean;
  readonly log?: (msg: string) => void;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  turnMs: 60_000,
  cubeMs: 30_000,
  graceMs: 90_000,
  nextGameMs: 4_000,
  maxTimeouts: 3,
  seedWaitMs: 3_000,
};

const MAX_BODY = 4_096;
const HEARTBEAT_MS = 30_000;
const MSG_PER_SECOND = 10;
const MSG_BURST = 40;
const MSG_DROP_LIMIT = 200;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const readJson = async (req: IncomingMessage): Promise<unknown> => {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
};

/** Very small fixed-window rate limiter per key (e.g. IP). */
const rateLimiter = (limit: number, windowMs: number) => {
  const hits = new Map<string, { count: number; start: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { count: 1, start: now });
      return true;
    }
    h.count++;
    return h.count <= limit;
  };
};

export interface RunningServer {
  readonly port: number;
  readonly store: Store;
  readonly lobby: Lobby;
  close(): Promise<void>;
}

/** HTTP (REST) + WebSocket game server. */
export const startServer = async (opts: ServerOptions): Promise<RunningServer> => {
  const log = opts.log ?? (() => {});
  const store = new Store(opts.dbPath);
  const lobby = new Lobby({
    store,
    timings: { ...DEFAULT_TIMINGS, ...opts.timings },
    log,
    randomSeats: opts.randomSeats,
    matchmaking: opts.matchmaking,
    fairPlay: opts.fairPlay,
  });
  const allowRegister = rateLimiter(10, 60_000);
  const cors = opts.corsOrigin ?? "*";

  const credentials = (req: IncomingMessage) => {
    const [id, token] = (req.headers.authorization ?? "").replace(/^Bearer /, "").split(".");
    return { id: id ?? "", token: token ?? "" };
  };
  const authPlayer = (req: IncomingMessage) => {
    const { id, token } = credentials(req);
    const player = id && token ? store.authenticate(id, token) : null;
    if (!player) throw new HttpError(401, "unauthorized");
    return player;
  };
  const allowLogin = rateLimiter(20, 60_000);
  /** Runs a store operation and maps account errors to HTTP errors. */
  const account = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof AccountError) throw new HttpError(e.status, e.message);
      throw e;
    }
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "GET" && path === "/api/health") return { ok: true, rooms: lobby.activeRooms };
    if (req.method === "POST" && path === "/api/players") {
      if (!allowRegister(req.socket.remoteAddress ?? "?")) throw new HttpError(429, "too many requests");
      const body = NameSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid name");
      res.statusCode = 201;
      return store.createPlayer(body.data.name);
    }
    if (req.method === "PATCH" && path === "/api/players/me") {
      const player = authPlayer(req);
      const body = NameSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid name");
      store.rename(player.id, body.data.name);
      return { id: player.id, name: body.data.name };
    }
    if (path.startsWith("/api/account")) {
      if (req.method === "POST" && path === "/api/account/login") {
        if (!allowLogin(req.socket.remoteAddress ?? "?")) throw new HttpError(429, "too many requests");
        const body = LoginSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid request");
        return account(() => store.login(body.data.username, body.data.password));
      }
      const player = authPlayer(req);
      if (req.method === "GET" && path === "/api/account") return store.account(player.id);
      if (req.method === "POST" && path === "/api/account/claim") {
        const body = ClaimSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid username, password or email");
        const { username, password, email } = body.data;
        return account(() => store.claimAccount(player.id, username, password, email || null));
      }
      if (req.method === "POST" && path === "/api/account/logout") {
        store.logout(credentials(req).token);
        return { ok: true };
      }
      if (req.method === "POST" && path === "/api/account/password") {
        const body = PasswordChangeSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid password");
        account(() => store.changePassword(player.id, body.data.oldPassword, body.data.newPassword));
        return { ok: true };
      }
    }
    if (req.method === "GET" && path === "/api/leaderboard") {
      const variant = url.searchParams.get("variant") ?? "backgammon";
      if (!(MATCH_VARIANTS as readonly string[]).includes(variant))
        throw new HttpError(400, "unknown variant");
      return store.leaderboard(variant as MatchVariantId);
    }
    let m = /^\/api\/players\/([\w-]{1,64})$/.exec(path);
    if (req.method === "GET" && m) {
      const profile = store.profile(m[1]!);
      if (!profile) throw new HttpError(404, "not found");
      return profile;
    }
    m = /^\/api\/matches\/([\w-]{1,64})$/.exec(path);
    if (req.method === "GET" && m) {
      const summary = store.matchSummary(m[1]!);
      const games = store.matchGames(m[1]!);
      if (!summary || !games) throw new HttpError(404, "not found");
      return { ...summary, games, fairness: store.matchFairness(m[1]!) };
    }
    throw new HttpError(404, "not found");
  };

  const http = createHttpServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", cors);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    try {
      const body = await route(req, res);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log(`HTTP error: ${String(e)}`);
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : "internal error" }));
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  http.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const clientIp = (req: IncomingMessage): string => {
    const forwarded = req.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
    return (opts.trustProxy && first) || req.socket.remoteAddress || "";
  };

  const alive = new WeakMap<WebSocket, boolean>();
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const conn: Conn = {
      send: (msg: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    alive.set(ws, true);
    lobby.connect(conn, clientIp(req));
    ws.on("pong", () => alive.set(ws, true));
    // Token bucket per connection: bursts are fine, floods are dropped and finally disconnected.
    const rate = opts.messageRate ?? { perSecond: MSG_PER_SECOND, burst: MSG_BURST };
    let tokens = rate.burst;
    let last = Date.now();
    let dropped = 0;
    ws.on("message", (data) => {
      const now = Date.now();
      tokens = Math.min(rate.burst, tokens + ((now - last) / 1000) * rate.perSecond);
      last = now;
      if (tokens < 1) {
        if (++dropped > MSG_DROP_LIMIT) return ws.close(4008, "rate limit");
        return conn.send({ t: "error", message: "slow down" });
      }
      tokens -= 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return conn.send({ t: "error", message: "invalid JSON" });
      }
      const msg = ClientMessageSchema.safeParse(parsed);
      if (!msg.success) return conn.send({ t: "error", message: "invalid message" });
      try {
        lobby.handle(conn, msg.data);
      } catch (e) {
        log(`message handling failed: ${String(e)}`);
        conn.send({ t: "error", message: "internal error" });
      }
    });
    ws.on("close", () => lobby.disconnect(conn));
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve) => http.listen(opts.port, opts.host ?? "0.0.0.0", resolve));
  const port = (http.address() as AddressInfo).port;
  log(`listening on :${port}`);

  return {
    port,
    store,
    lobby,
    close: async () => {
      clearInterval(heartbeat);
      lobby.dispose();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      store.close();
    },
  };
};
