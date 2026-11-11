import { legalMoves, playerToAct } from "@tavli/engine";
import type { LeaderboardEntry, ProfileResponse, ServerMessage } from "@tavli/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ratingChange, winProbability } from "../src/rating";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

type State = Extract<ServerMessage, { t: "state" }>;

describe("FIBS rating", () => {
  it("is zero-sum between equal players and favours the underdog", () => {
    const [w, l] = ratingChange({ rating: 1500, experience: 1000 }, { rating: 1500, experience: 1000 }, 5);
    expect(w).toBeCloseTo(4.47, 1);
    expect(l).toBeCloseTo(-4.47, 1);
    const upset = ratingChange({ rating: 1400, experience: 1000 }, { rating: 1600, experience: 1000 }, 5);
    expect(upset[0]).toBeGreaterThan(w);
  });

  it("longer matches favour the stronger player more", () => {
    expect(winProbability(1600, 1500, 11)).toBeGreaterThan(winProbability(1600, 1500, 1));
  });

  it("new players move faster", () => {
    const [fresh] = ratingChange({ rating: 1500, experience: 0 }, { rating: 1500, experience: 1000 }, 1);
    expect(fresh).toBeCloseTo(10, 0);
  });
});

describe("online server", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await start();
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  const pair = async () => {
    const pa = await register(server, "Alice");
    const pb = await register(server, "Bob");
    const a = await TestClient.connect(server, pa);
    const b = await TestClient.connect(server, pb);
    clients.push(a, b);
    return { a, b, pa, pb };
  };

  /** Plays the game on behalf of whoever is to act until `stop` returns true. */
  const autoplay = async (seats: [TestClient, TestClient], stop: (s: State) => boolean) => {
    let state = seats[0].last("state")!;
    for (let i = 0; i < 2000 && !stop(state); i++) {
      const g = state.match.game;
      const actor = playerToAct(g);
      if (actor === null) {
        state = await seats[0].next("state");
        continue;
      }
      const c = seats[actor];
      const nextState = seats[0].next("state");
      if (g.phase === "rolling") c.send({ t: "action", action: { type: "roll" } });
      else if (g.phase === "cube-offered") c.send({ t: "action", action: { type: "take" } });
      else if (g.phase === "moving") {
        const moves = legalMoves(g);
        c.send({
          t: "action",
          action: moves.length ? { type: "move", move: moves[0]! } : { type: "confirm" },
        });
      }
      state = await nextState;
    }
    return state;
  };

  it("registers players and authenticates them", async () => {
    const p = await register(server, "Carla");
    const c = await TestClient.connect(server);
    clients.push(c);
    c.send({ t: "hello", playerId: p.id, token: "wrong" });
    expect((await c.next("error")).message).toMatch(/unknown/);
    const ok = await TestClient.connect(server, p);
    clients.push(ok);
    expect(ok.last("welcome")?.player.name).toBe("Carla");
  });

  it("matches two queued players and plays with server-rolled dice", async () => {
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    const startA = a.next("match-start");
    const stateA = a.next("state");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    expect((await startA).seat).toBe(0);
    const first = await stateA;
    // The server rolled the opening: the game is already in progress.
    expect(first.opening).not.toBeNull();
    expect(first.match.game.phase).toBe("moving");
    expect(first.deadline).toBeGreaterThan(Date.now());
  });

  it("rejects actions out of turn and illegal moves", async () => {
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "portes", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "portes", length: 1 });
    const state = await a.next("state");
    const actor = playerToAct(state.match.game)!;
    const idle = actor === 0 ? b : a;
    idle.send({ t: "action", action: { type: "roll" } });
    expect((await idle.next("error")).message).toMatch(/not your turn/);
    const active = actor === 0 ? a : b;
    active.send({ t: "action", action: { type: "confirm" } });
    expect((await active.next("error")).message).toMatch(/not allowed/);
  });

  it("finishes a match by resignation, stores it and updates the leaderboard", async () => {
    const { a, b, pa } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("state");
    // Play a few actions so the match counts as rated, then resign.
    await autoplay([a, b], (s) => s.match.game.history.length >= 2);
    const end = a.next("match-end");
    b.send({ t: "action", action: { type: "resign", level: 1 } });
    const result = await end;
    expect(result.winner).toBe(0);
    expect(result.ratingDelta[0]).toBeGreaterThan(0);
    expect(result.ratingDelta[1]).toBeLessThan(0);
    const board = await api<LeaderboardEntry[]>(server, "/api/leaderboard?variant=backgammon");
    expect(board[0]?.playerId).toBe(pa.id);
    const profile = await api<ProfileResponse>(server, `/api/players/${pa.id}`);
    expect(profile.recent).toHaveLength(1);
  });

  it("plays a full 1-point game to the end", async () => {
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "plakoto", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "plakoto", length: 1 });
    await a.next("state");
    const end = a.next("match-end", () => true, 20_000);
    const final = await autoplay([a, b], (s) => s.match.winner !== null);
    expect(final.match.game.phase).toBe("finished");
    expect((await end).reason).toBe("won");
  }, 30_000);

  it("pairs players through a private invite code", async () => {
    const { a, b } = await pair();
    a.send({ t: "create", variant: "fevga", length: 3 });
    const { code } = await a.next("room-created");
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const start = b.next("match-start");
    b.send({ t: "join", code: code.toLowerCase() });
    expect((await start).config).toMatchObject({ variant: "fevga", length: 3 });
  });

  it("lets a disconnected player reconnect and resume", async () => {
    const { a, b, pb } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 3 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 3 });
    const before = await b.next("state");
    const notice = a.next("opponent", (m) => !m.connected);
    await b.close();
    expect((await notice).graceUntil).toBeGreaterThan(Date.now());
    const back = a.next("opponent", (m) => m.connected);
    const b2 = await TestClient.connect(server);
    clients.push(b2);
    const resumed = b2.next("state");
    b2.send({ t: "hello", playerId: pb.id, token: pb.token });
    expect((await b2.next("match-start")).seat).toBe(1);
    expect((await resumed).match.game.history).toEqual(before.match.game.history);
    await back;
  });

  it("forfeits a player who does not come back in time", async () => {
    await server.close();
    server = await start({ graceMs: 200 });
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("state");
    const end = a.next("match-end");
    await b.close();
    expect(await end).toMatchObject({ winner: 0, reason: "abandoned" });
  });

  it("lets a bot act when the clock runs out", async () => {
    await server.close();
    server = await start({ turnMs: 150 });
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    const first = await a.next("state");
    const actor = playerToAct(first.match.game);
    // Nobody acts: the server must move on by itself.
    const moved = await a.next("state", (s) => s.by === actor && s.action !== null, 3000);
    expect(moved.action).not.toBeNull();
  });
});
