import { timingSafeEqual } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  BanSchema,
  ClaimSchema,
  ClientMessageSchema,
  DeleteAccountSchema,
  FriendRequestSchema,
  LoginSchema,
  MATCH_VARIANTS,
  type MatchVariantId,
  NameSchema,
  PasswordChangeSchema,
  PushSubscribeSchema,
  PushUnsubscribeSchema,
  ReportSchema,
  ResolveSchema,
  type ServerMessage,
} from "@tavli/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { type AnalysisMode, Analyzer } from "./analysis";
import { AccountError, Store } from "./db";
import { type FairPlayOptions, Lobby, type MatchmakingOptions } from "./lobby";
import { Push, type PushOptions } from "./push";
import type { Conn, RoomTimings } from "./room";
import type { TournamentOptions } from "./tournaments";

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
  /** Enables the moderation API (header `X-Admin-Token`); at least 16 characters. */
  readonly adminToken?: string;
  /** Fair-play analysis of finished matches: worker thread (production), inline or off. */
  readonly analysis?: AnalysisMode;
  readonly tournaments?: Partial<TournamentOptions>;
  /** Web Push notifications (VAPID keys are generated and stored when not given); false = off. */
  readonly push?: Partial<PushOptions> | false;
  readonly log?: (msg: string) => void;
  /** WebSocket connections per IP; default 20. */
  readonly maxConnectionsPerIp?: number;
  /** Daily copies of the database (VACUUM INTO) into this directory, keeping the newest `backupKeep`. */
  readonly backupDir?: string;
  readonly backupKeep?: number;
  /** Interval of the maintenance job (retention, backups); default once a day, 0 = off. */
  readonly maintenanceMs?: number;
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

/**
 * IPv6 clients usually control a whole /64: rate limits and connection caps count the prefix,
 * so that rotating addresses does not help. IPv4 (also mapped ::ffff:a.b.c.d) stays as is.
 */
export const ipKey = (ip: string): string => {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
};

/** Small fixed-window rate limiter per key (IP prefix, player, …); expired windows are pruned. */
export const rateLimiter = (limit: number, windowMs: number) => {
  const hits = new Map<string, { count: number; start: number }>();
  let lastPrune = Date.now();
  const hit = (key: string): boolean => {
    const now = Date.now();
    if (now - lastPrune > windowMs) {
      for (const [k, h] of hits) if (now - h.start > windowMs) hits.delete(k);
      lastPrune = now;
    }
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { count: 1, start: now });
      return true;
    }
    h.count++;
    return h.count <= limit;
  };
  /** Hits in the current window without counting one. */
  const peek = (key: string): number => {
    const h = hits.get(key);
    return h && Date.now() - h.start <= windowMs ? h.count : 0;
  };
  return Object.assign(hit, { peek });
};

/** WebSocket connections per IP (prefix) and the time a socket may stay without `hello`. */
const MAX_CONNECTIONS_PER_IP = 20;
const HELLO_TIMEOUT_MS = 10_000;

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
  const analyzer = new Analyzer(opts.analysis ?? "inline", log);
  const push =
    opts.push === false
      ? null
      : new Push(store, { subject: "https://github.com/roqz/backgammon-tavli", ...opts.push }, log);
  const lobby = new Lobby({
    store,
    timings: { ...DEFAULT_TIMINGS, ...opts.timings },
    log,
    randomSeats: opts.randomSeats,
    matchmaking: opts.matchmaking,
    fairPlay: opts.fairPlay,
    analyzer,
    tournaments: opts.tournaments,
    push: push ?? undefined,
  });
  const allowRegister = rateLimiter(10, 60_000);
  /** Per player: renames, password changes, exports. */
  const allowRename = rateLimiter(5, 60 * 60_000);
  const allowPasswordChange = rateLimiter(5, 15 * 60_000);
  const allowExport = rateLimiter(5, 60 * 60_000);
  const allowFriendRequest = rateLimiter(30, 60 * 60_000);
  /** Failed logins per username: after 10 in 15 minutes the account waits (against password guessing). */
  const failedLogins = rateLimiter(10, 15 * 60_000);
  const cors = opts.corsOrigin ?? "*";

  const credentials = (req: IncomingMessage) => {
    const [id, token] = (req.headers.authorization ?? "").replace(/^Bearer /, "").split(".");
    return { id: id ?? "", token: token ?? "" };
  };
  const authPlayer = (req: IncomingMessage) => {
    const { id, token } = credentials(req);
    const player = id && token ? store.authenticate(id, token) : null;
    if (!player) throw new HttpError(401, "unauthorized");
    if (player.banned) throw new HttpError(403, "banned");
    return player;
  };
  const adminToken = opts.adminToken && opts.adminToken.length >= 16 ? Buffer.from(opts.adminToken) : null;
  const requireAdmin = (req: IncomingMessage) => {
    const given = Buffer.from(String(req.headers["x-admin-token"] ?? ""));
    if (!adminToken) throw new HttpError(404, "not found");
    if (given.length !== adminToken.length || !timingSafeEqual(given, adminToken))
      throw new HttpError(401, "unauthorized");
  };
  const allowAdmin = rateLimiter(60, 60_000);
  const allowLogin = rateLimiter(20, 60_000);
  /** Runs a store operation and maps account errors to HTTP errors. */
  const account = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AccountError) throw new HttpError(e.status, e.message);
      throw e;
    }
  };

  /**
   * Behind the reverse proxy the client address is the last X-Forwarded-For entry (the one the
   * proxy appended); earlier entries come from the client and cannot be trusted.
   */
  const clientIpOf = (req: IncomingMessage): string => {
    const forwarded = req.headers["x-forwarded-for"];
    const last = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)?.split(",").pop()?.trim();
    return (opts.trustProxy && last) || req.socket.remoteAddress || "";
  };
  const limitKey = (req: IncomingMessage) => ipKey(clientIpOf(req));

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "GET" && path === "/api/health") {
      if (!store.healthy()) throw new HttpError(503, "database unavailable");
      return { ok: true, rooms: lobby.activeRooms };
    }
    if (req.method === "POST" && path === "/api/players") {
      if (!allowRegister(limitKey(req))) throw new HttpError(429, "too many requests");
      const body = NameSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid name");
      res.statusCode = 201;
      return store.createPlayer(body.data.name);
    }
    if (req.method === "PATCH" && path === "/api/players/me") {
      const player = authPlayer(req);
      const body = NameSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid name");
      if (!allowRename(player.id)) throw new HttpError(429, "too many requests");
      store.rename(player.id, body.data.name);
      return { id: player.id, name: body.data.name };
    }
    if (path.startsWith("/api/account")) {
      if (req.method === "POST" && path === "/api/account/login") {
        if (!allowLogin(limitKey(req))) throw new HttpError(429, "too many requests");
        const body = LoginSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid request");
        const user = body.data.username.toLowerCase();
        if (failedLogins.peek(user) >= 10)
          throw new HttpError(429, "too many failed logins, wait 15 minutes");
        try {
          return await account(() => store.login(body.data.username, body.data.password));
        } catch (e) {
          if (e instanceof HttpError && e.status === 401) failedLogins(user);
          throw e;
        }
      }
      const player = authPlayer(req);
      if (req.method === "GET" && path === "/api/account") return store.account(player.id);
      if (req.method === "GET" && path === "/api/account/export") {
        if (!allowExport(player.id)) throw new HttpError(429, "too many requests");
        res.setHeader("Content-Disposition", 'attachment; filename="tavli-data.json"');
        return store.exportData(player.id);
      }
      if (req.method === "POST" && path === "/api/account/delete") {
        // Accounts confirm with the password; guests (no password) with their token only.
        const body = DeleteAccountSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid request");
        const info = store.account(player.id);
        if (info?.username) {
          if (!allowPasswordChange(player.id)) throw new HttpError(429, "too many requests");
          await account(() => store.checkPassword(player.id, body.data.password ?? ""));
        }
        lobby.kick(player.id, "deleted");
        store.deletePlayer(player.id);
        log(`player ${player.id} deleted their profile`);
        return { ok: true };
      }
      if (req.method === "POST" && path === "/api/account/logout-all") {
        return { ok: true, ended: store.logoutOthers(player.id, credentials(req).token) };
      }
      if (req.method === "POST" && path === "/api/account/claim") {
        const body = ClaimSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid username, password or email");
        const { username, password, email } = body.data;
        return await account(() => store.claimAccount(player.id, username, password, email || null));
      }
      if (req.method === "POST" && path === "/api/account/logout") {
        store.logout(credentials(req).token);
        return { ok: true };
      }
      if (req.method === "POST" && path === "/api/account/password") {
        const body = PasswordChangeSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid password");
        if (!allowPasswordChange(player.id)) throw new HttpError(429, "too many requests");
        await account(() =>
          store.changePassword(
            player.id,
            body.data.oldPassword,
            body.data.newPassword,
            credentials(req).token,
          ),
        );
        return { ok: true };
      }
    }
    if (req.method === "POST" && path === "/api/reports") {
      const player = authPlayer(req);
      const body = ReportSchema.safeParse(await readJson(req));
      if (!body.success || body.data.playerId === player.id) throw new HttpError(400, "invalid report");
      const { playerId, matchId, reason, note } = body.data;
      // Only opponents of a (running or archived) match can be reported.
      const archived = matchId ? store.matchSummary(matchId) : null;
      const ids = archived?.players.map((p) => p.id) ?? [];
      const together =
        !!matchId &&
        ((ids.includes(player.id) && ids.includes(playerId)) ||
          lobby.sharedMatch(player.id, playerId, matchId));
      if (!together) throw new HttpError(403, "you can only report opponents");
      const filed = store.addReport({ reporter: player.id, reported: playerId, matchId, reason, note });
      res.statusCode = filed ? 201 : 200;
      return { ok: true, duplicate: !filed };
    }
    if (path.startsWith("/api/admin/")) {
      if (!allowAdmin(limitKey(req))) throw new HttpError(429, "too many requests");
      requireAdmin(req);
      if (req.method === "GET" && path === "/api/admin/signals") return store.signals();
      if (req.method === "GET" && path === "/api/admin/reports")
        return store.reports(url.searchParams.get("status") !== "resolved");
      let a = /^\/api\/admin\/reports\/(\d{1,12})\/resolve$/.exec(path);
      if (req.method === "POST" && a) {
        const body = ResolveSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid resolution");
        if (!store.resolveReport(Number(a[1]), body.data.resolution)) throw new HttpError(404, "not found");
        return { ok: true };
      }
      a = /^\/api\/admin\/players\/([\w-]{1,64})$/.exec(path);
      if (req.method === "GET" && a) {
        const info = store.moderationInfo(a[1]!);
        if (!info) throw new HttpError(404, "not found");
        return info;
      }
      a = /^\/api\/admin\/players\/([\w-]{1,64})\/ban$/.exec(path);
      if (req.method === "POST" && a) {
        const body = BanSchema.safeParse(await readJson(req));
        if (!body.success) throw new HttpError(400, "invalid ban");
        if (!store.setBan(a[1]!, body.data.reason)) throw new HttpError(404, "not found");
        if (body.data.reason !== null) lobby.kick(a[1]!);
        log(`moderation: player ${a[1]} ${body.data.reason === null ? "unbanned" : "banned"}`);
        return store.moderationInfo(a[1]!);
      }
      throw new HttpError(404, "not found");
    }
    if (req.method === "GET" && path === "/api/leaderboard") {
      const variant = url.searchParams.get("variant") ?? "backgammon";
      if (!(MATCH_VARIANTS as readonly string[]).includes(variant))
        throw new HttpError(400, "unknown variant");
      return store.leaderboard(variant as MatchVariantId);
    }
    if (req.method === "GET" && path === "/api/tournaments") return lobby.tournaments.list();
    if (req.method === "GET" && path === "/api/live") return lobby.liveMatches();
    if (path === "/api/friends" && req.method === "GET") {
      const player = authPlayer(req);
      return store.friendsOf(player.id).map((f) => ({
        ...f,
        ...(f.status === "accepted" ? lobby.presence(f.id) : { presence: null, matchId: null }),
      }));
    }
    if (path === "/api/friends" && req.method === "POST") {
      const player = authPlayer(req);
      const body = FriendRequestSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid request");
      if (!allowFriendRequest(player.id)) throw new HttpError(429, "too many requests");
      const result = await account(() => store.befriend(player.id, body.data.playerId));
      if (result !== "already") lobby.notify(body.data.playerId, { t: "friends-changed" });
      return { ok: true, result };
    }
    if (path === "/api/friends/remove" && req.method === "POST") {
      const player = authPlayer(req);
      const body = FriendRequestSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid request");
      if (store.unfriend(player.id, body.data.playerId))
        lobby.notify(body.data.playerId, { t: "friends-changed" });
      return { ok: true };
    }
    if (path === "/api/push/key" && req.method === "GET") {
      if (!push) throw new HttpError(404, "push disabled");
      return { publicKey: push.publicKey };
    }
    if (path === "/api/push/subscribe" && req.method === "POST") {
      if (!push) throw new HttpError(404, "push disabled");
      const player = authPlayer(req);
      const body = PushSubscribeSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid subscription");
      if (!push.subscribe(player.id, body.data)) throw new HttpError(400, "unsupported push service");
      return { ok: true };
    }
    if (path === "/api/push/unsubscribe" && req.method === "POST") {
      if (!push) throw new HttpError(404, "push disabled");
      const player = authPlayer(req);
      const body = PushUnsubscribeSchema.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "invalid request");
      push.unsubscribe(player.id, body.data.endpoint);
      return { ok: true };
    }
    let m = /^\/api\/players\/([\w-]{1,64})$/.exec(path);
    if (req.method === "GET" && m) {
      const profile = store.profile(m[1]!);
      if (!profile) throw new HttpError(404, "not found");
      return profile;
    }
    m = /^\/api\/tournaments\/([\w-]{1,64})$/.exec(path);
    if (req.method === "GET" && m) {
      const view = lobby.tournaments.view(m[1]!);
      if (!view) throw new HttpError(404, "not found");
      return view;
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
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

  const alive = new WeakMap<WebSocket, boolean>();
  const connectionsByIp = new Map<string, number>();
  const maxPerIp = opts.maxConnectionsPerIp ?? MAX_CONNECTIONS_PER_IP;
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const key = limitKey(req);
    const open = connectionsByIp.get(key) ?? 0;
    if (open >= maxPerIp) return ws.close(4029, "too many connections");
    connectionsByIp.set(key, open + 1);
    const conn: Conn = {
      send: (msg: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    alive.set(ws, true);
    lobby.connect(conn, clientIpOf(req));
    // Sockets that never identify themselves are closed.
    const helloTimer = setTimeout(() => {
      if (!lobby.isAuthenticated(conn)) ws.close(4001, "no hello");
    }, HELLO_TIMEOUT_MS);
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
    ws.on("close", () => {
      clearTimeout(helloTimer);
      const n = (connectionsByIp.get(key) ?? 1) - 1;
      if (n <= 0) connectionsByIp.delete(key);
      else connectionsByIp.set(key, n);
      lobby.disconnect(conn);
    });
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

  /** Retention periods and backups, once a day (first run one minute after the start). */
  const maintain = () => {
    try {
      const pruned = store.prune();
      if (pruned.guests + pruned.fairPlay + pruned.reports > 0)
        log(
          `retention: removed ${pruned.guests} inactive guests, ${pruned.fairPlay} fair-play rows, ${pruned.reports} reports`,
        );
      if (opts.backupDir) {
        mkdirSync(opts.backupDir, { recursive: true });
        const file = join(opts.backupDir, `tavli-${new Date().toISOString().slice(0, 10)}.db`);
        rmSync(file, { force: true });
        store.backup(file);
        const keep = opts.backupKeep ?? 14;
        const old = readdirSync(opts.backupDir)
          .filter((f) => /^tavli-d{4}-d{2}-d{2}.db$/.test(f))
          .sort()
          .reverse()
          .slice(keep);
        for (const f of old) rmSync(join(opts.backupDir, f), { force: true });
        log(`backup written: ${file}`);
      }
    } catch (e) {
      log(`maintenance failed: ${String(e)}`);
    }
  };
  const maintenanceMs = opts.maintenanceMs ?? 24 * 60 * 60_000;
  const maintenance = maintenanceMs > 0 ? setInterval(maintain, maintenanceMs) : null;
  const firstMaintenance = maintenanceMs > 0 ? setTimeout(maintain, 60_000) : null;
  maintenance?.unref();
  firstMaintenance?.unref();

  await new Promise<void>((resolve) => http.listen(opts.port, opts.host ?? "0.0.0.0", resolve));
  const port = (http.address() as AddressInfo).port;
  log(`listening on :${port}`);

  return {
    port,
    store,
    lobby,
    close: async () => {
      clearInterval(heartbeat);
      if (maintenance) clearInterval(maintenance);
      if (firstMaintenance) clearTimeout(firstMaintenance);
      lobby.announceShutdown();
      lobby.dispose();
      await analyzer.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      store.close();
    },
  };
};
