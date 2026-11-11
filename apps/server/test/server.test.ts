import { legalMoves, playerToAct } from "@tavli/engine";
import type {
  AccountResponse,
  LeaderboardEntry,
  MatchDetailResponse,
  ProfileResponse,
  RegisterResponse,
  ServerMessage,
} from "@tavli/protocol";
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

  it("pairs close ratings at once and distant ratings only after waiting", async () => {
    await server.close();
    server = await start({}, { baseWindow: 100, growthPerSecond: 500 });
    const { a, b, pa, pb } = await pair();
    server.store.setRating(pa.id, "backgammon", 1500);
    server.store.setRating(pb.id, "backgammon", 1900);
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    const queuedAt = Date.now();
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    await b.next("queued"); // 400 apart: not paired immediately
    await a.next("match-start", () => true, 3000); // windows grow by 500/s
    expect(Date.now() - queuedAt).toBeGreaterThan(300);
  });

  it("prefers the closest rating among waiting players", async () => {
    await server.close();
    server = await start({}, { baseWindow: 150, growthPerSecond: 0 });
    const p = await Promise.all(["Low", "High", "New"].map((n) => register(server, n)));
    server.store.setRating(p[0]!.id, "portes", 1450);
    server.store.setRating(p[1]!.id, "portes", 1650); // 200 apart: Low and High never meet
    server.store.setRating(p[2]!.id, "portes", 1560); // within reach of both, closer to High
    const [low, high, fresh] = await Promise.all(p.map((x) => TestClient.connect(server, x)));
    clients.push(low!, high!, fresh!);
    low!.send({ t: "queue", variant: "portes", length: 3 });
    await low!.next("queued");
    high!.send({ t: "queue", variant: "portes", length: 3 });
    await high!.next("queued");
    const started = high!.next("match-start");
    fresh!.send({ t: "queue", variant: "portes", length: 3 });
    const m = await started;
    expect(m.players.map((x) => x.id).sort()).toEqual([p[1]!.id, p[2]!.id].sort());
  });

  it("starts a rematch with swapped colours when both agree", async () => {
    const { a, b, pa } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    const first = await a.next("match-start");
    const endA = a.next("match-end");
    const endB = b.next("match-end");
    b.send({ t: "action", action: { type: "resign", level: 1 } });
    await Promise.all([endA, endB]);
    const offer = b.next("rematch-offer");
    a.send({ t: "rematch" });
    await offer;
    const second = a.next("match-start", (m) => m.matchId !== first.matchId);
    b.send({ t: "rematch" });
    const started = await second;
    expect(started.players[1].id).toBe(pa.id); // Alice was white, now black
    expect(started.seat).toBe(1);
  });

  it("notifies the opponent when a rematch is declined", async () => {
    const { a, b } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 1 });
    await a.next("match-start");
    const endA = a.next("match-end");
    b.send({ t: "action", action: { type: "resign", level: 1 } });
    await endA;
    const declined = a.next("rematch-declined");
    b.send({ t: "rematch-decline" });
    await declined;
    a.send({ t: "rematch" });
    await a.next("rematch-declined");
  });

  it("upgrades a guest to an account and logs in from another device", async () => {
    const guest = await register(server, "Dana");
    const auth = { Authorization: `Bearer ${guest.id}.${guest.token}` };
    const acc = await api<AccountResponse>(server, "/api/account/claim", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ username: "dana_1", password: "correct horse" }),
    });
    expect(acc).toMatchObject({ id: guest.id, username: "dana_1" });
    // second device
    const login = await api<RegisterResponse>(server, "/api/account/login", {
      method: "POST",
      body: JSON.stringify({ username: "DANA_1", password: "correct horse" }),
    });
    expect(login.id).toBe(guest.id);
    expect(login.token).not.toBe(guest.token);
    const device2 = await TestClient.connect(server, login);
    clients.push(device2);
    expect(device2.last("welcome")?.player.id).toBe(guest.id);
    // logout revokes the session token, the first device keeps working
    await api(server, "/api/account/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${login.id}.${login.token}` },
    });
    await expect(
      api(server, "/api/account", { headers: { Authorization: `Bearer ${login.id}.${login.token}` } }),
    ).rejects.toThrow(/401/);
    expect((await api<AccountResponse>(server, "/api/account", { headers: auth })).username).toBe("dana_1");
  });

  it("rejects wrong passwords, taken usernames and weak passwords", async () => {
    const a = await register(server, "Eve");
    const b = await register(server, "Finn");
    const claim = (p: RegisterResponse, username: string, password: string) =>
      api(server, "/api/account/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${p.id}.${p.token}` },
        body: JSON.stringify({ username, password }),
      });
    await claim(a, "eve", "long enough");
    await expect(claim(b, "EVE", "long enough")).rejects.toThrow(/409/);
    await expect(claim(b, "finn", "short")).rejects.toThrow(/400/);
    await expect(claim(a, "eve2", "long enough")).rejects.toThrow(/409/);
    await expect(
      api(server, "/api/account/login", {
        method: "POST",
        body: JSON.stringify({ username: "eve", password: "nope" }),
      }),
    ).rejects.toThrow(/401/);
    await expect(
      api(server, "/api/account/login", {
        method: "POST",
        body: JSON.stringify({ username: "nobody", password: "x" }),
      }),
    ).rejects.toThrow(/401/);
  });

  it("serves finished games with results for replays", async () => {
    const { a, b, pa } = await pair();
    a.send({ t: "queue", variant: "backgammon", length: 3 });
    await a.next("queued");
    b.send({ t: "queue", variant: "backgammon", length: 3 });
    await a.next("state");
    const end = a.next("match-end");
    b.send({ t: "action", action: { type: "resign", level: 3 } }); // 3 points: match over
    await end;
    const profile = await api<ProfileResponse>(server, `/api/players/${pa.id}`);
    const detail = await api<MatchDetailResponse>(server, `/api/matches/${profile.recent[0]!.id}`);
    expect(detail.games).toHaveLength(1);
    expect(detail.games[0]!.result).toMatchObject({ winner: 0, points: 3, reason: "resign" });
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
