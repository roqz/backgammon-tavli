import { randomBytes } from "node:crypto";
import type { ClientMessage, RegisterResponse, ServerMessage } from "@tavli/protocol";
import { WebSocket } from "ws";
import { type RunningServer, startServer } from "../src/server";

export const start = (
  timings: Parameters<typeof startServer>[0]["timings"] = {},
  matchmaking: Parameters<typeof startServer>[0]["matchmaking"] = {},
  fairPlay: Parameters<typeof startServer>[0]["fairPlay"] = {},
  // generous by default: test bots act much faster than people
  messageRate: Parameters<typeof startServer>[0]["messageRate"] = { perSecond: 10_000, burst: 10_000 },
  extra: Partial<Parameters<typeof startServer>[0]> = {},
) =>
  startServer({
    ...extra,
    fairPlay: { blockSameNetwork: false, ...fairPlay },
    messageRate,
    matchmaking: { sweepMs: 50, ...matchmaking },
    port: 0,
    host: "127.0.0.1",
    dbPath: ":memory:",
    randomSeats: false,
    timings: {
      turnMs: 5_000,
      cubeMs: 5_000,
      graceMs: 2_000,
      nextGameMs: 50,
      maxTimeouts: 3,
      seedWaitMs: 1_000,
      ...timings,
    },
  });

export const api = async <T>(server: RunningServer, path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

export const register = (server: RunningServer, name: string) =>
  api<RegisterResponse>(server, "/api/players", { method: "POST", body: JSON.stringify({ name }) });

type Msg<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;

/** WebSocket test client that records every server message. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  /** Send a dice seed automatically after match-start (like the real client). */
  autoSeed = true;
  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      if (msg.t === "match-start" && this.autoSeed) {
        this.send({ t: "seed", value: randomBytes(16).toString("hex") });
      }
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
  }

  static async connect(
    server: RunningServer,
    player?: RegisterResponse,
    deviceId?: string,
  ): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const c = new TestClient(ws);
    if (player) {
      c.send({ t: "hello", playerId: player.id, token: player.token, deviceId });
      await c.next("welcome");
    }
    return c;
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Waits for the next message (after now) of a type matching an optional predicate. */
  next<T extends ServerMessage["t"]>(
    t: T,
    pred: (m: Msg<T>) => boolean = () => true,
    timeoutMs = 4000,
  ): Promise<Msg<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeoutMs);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Msg<T>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Msg<T>);
        },
      });
    });
  }

  /** Latest message of a type that was already received. */
  last<T extends ServerMessage["t"]>(t: T): Msg<T> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--)
      if (this.messages[i]!.t === t) return this.messages[i] as Msg<T>;
    return undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }
}
