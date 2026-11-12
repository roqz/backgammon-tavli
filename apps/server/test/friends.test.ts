import type { FriendView, LiveMatch, RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

const bearer = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("friends and spectators", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  const connect = async (p: RegisterResponse) => {
    const c = await TestClient.connect(server, p);
    clients.push(c);
    return c;
  };
  const befriend = (from: RegisterResponse, to: RegisterResponse) =>
    api<{ result: string }>(server, "/api/friends", {
      method: "POST",
      headers: bearer(from),
      body: JSON.stringify({ playerId: to.id }),
    });
  const friends = (p: RegisterResponse) => api<FriendView[]>(server, "/api/friends", { headers: bearer(p) });

  it("request, accept, presence and removal", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const cb = await connect(b);
    const changed = cb.next("friends-changed");
    expect((await befriend(a, b)).result).toBe("requested");
    await changed;
    expect(await friends(a)).toMatchObject([{ id: b.id, status: "outgoing", presence: null }]);
    expect(await friends(b)).toMatchObject([{ id: a.id, status: "incoming" }]);
    expect((await befriend(b, a)).result).toBe("accepted");
    // Ben is connected, Ann is not
    expect(await friends(a)).toMatchObject([{ id: b.id, status: "accepted", presence: "online" }]);
    expect(await friends(b)).toMatchObject([{ id: a.id, status: "accepted", presence: "offline" }]);
    await api(server, "/api/friends/remove", {
      method: "POST",
      headers: bearer(a),
      body: JSON.stringify({ playerId: b.id }),
    });
    expect(await friends(b)).toEqual([]);
    await expect(befriend(a, a)).rejects.toThrow(/400/);
  });

  it("a friend can be challenged; accepting starts the match, declining tells the challenger", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const c = await register(server, "Cid");
    await befriend(a, b);
    await befriend(b, a);
    const ca = await connect(a);
    const cb = await connect(b);
    const cc = await connect(c);

    // only friends can be challenged
    cc.send({ t: "challenge", playerId: a.id, variant: "portes", length: 1 });
    expect((await cc.next("error")).message).toBe("not friends");

    const incoming = cb.next("challenge");
    ca.send({ t: "challenge", playerId: b.id, variant: "portes", length: 3 });
    expect((await ca.next("challenge-update")).status).toBe("sent");
    const ch = await incoming;
    expect(ch).toMatchObject({ from: { id: a.id }, variant: "portes", length: 3 });
    const declined = ca.next("challenge-update", (m) => m.status === "declined");
    cb.send({ t: "challenge-answer", id: ch.id, accept: false });
    await declined;

    const second = cb.next("challenge");
    ca.send({ t: "challenge", playerId: b.id, variant: "fevga", length: 1 });
    const ch2 = await second;
    const startA = ca.next("match-start");
    cb.send({ t: "challenge-answer", id: ch2.id, accept: true });
    expect((await startA).config.variant).toBe("fevga");
    // a challenged friend in a match is busy
    expect(await friends(b)).toMatchObject([{ presence: "playing", matchId: null }]);
  });

  it("public matches can be watched; private invites cannot", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const w = await register(server, "Wes");
    const ca = await connect(a);
    const cb = await connect(b);
    const cw = await connect(w);
    ca.send({ t: "queue", variant: "backgammon", length: 1 });
    cb.send({ t: "queue", variant: "backgammon", length: 1 });
    const started = await ca.next("match-start");
    const live = await api<LiveMatch[]>(server, "/api/live");
    expect(live.map((m) => m.matchId)).toEqual([started.matchId]);

    const first = cw.next("watch-state");
    cw.send({ t: "watch", matchId: started.matchId });
    const view = await first;
    expect(view.players.map((p) => p.name)).toEqual(["Ann", "Ben"]);
    expect(view.spectators).toBe(1);
    // moves reach the spectator
    const g = view.match.game;
    const actor = g.phase === "rolling" ? g.turn : null;
    if (actor !== null) {
      const next = cw.next("watch-state", (m) => m.match.game.phase !== "rolling");
      (actor === 0 ? ca : cb).send({ t: "action", action: { type: "roll" } });
      await next;
    }
    const end = cw.next("watch-end");
    cb.send({ t: "action", action: { type: "resign", level: 1 } });
    expect((await end).winner).toBe(0);

    // private invite: not listed, not watchable
    ca.send({ t: "create", variant: "backgammon", length: 1 });
    const { code } = await ca.next("room-created");
    cb.send({ t: "join", code });
    const priv = await ca.next("match-start", (m) => m.matchId !== started.matchId);
    expect((await api<LiveMatch[]>(server, "/api/live")).map((m) => m.matchId)).not.toContain(priv.matchId);
    cw.send({ t: "watch", matchId: priv.matchId });
    expect((await cw.next("error")).message).toBe("match not watchable");
  });
});

describe("private watching, delay and challenge push", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });
  const connect = async (p: RegisterResponse) => {
    const c = await TestClient.connect(server, p);
    clients.push(c);
    return c;
  };
  const befriend = async (a: RegisterResponse, b: RegisterResponse) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const)
      await api(server, "/api/friends", {
        method: "POST",
        headers: bearer(x),
        body: JSON.stringify({ playerId: y.id }),
      });
  };
  const privateMatch = async (ca: TestClient, cb: TestClient) => {
    ca.send({ t: "create", variant: "backgammon", length: 1 });
    const { code } = await ca.next("room-created");
    cb.send({ t: "join", code });
    return (await ca.next("match-start")).matchId;
  };

  it("friends may watch private matches unless a player turned it off", async () => {
    server = await start();
    const [a, b, f] = [
      await register(server, "Ann"),
      await register(server, "Ben"),
      await register(server, "Fay"),
    ];
    await befriend(a, f);
    const [ca, cb, cf] = [await connect(a), await connect(b), await connect(f)];
    const matchId = await privateMatch(ca, cb);
    const list = await api<FriendView[]>(server, "/api/friends", { headers: bearer(f) });
    expect(list).toMatchObject([{ id: a.id, presence: "playing", matchId }]);
    const view = cf.next("watch-state");
    cf.send({ t: "watch", matchId });
    expect((await view).private).toBe(true);
    cf.send({ t: "unwatch" });
    // Ben does not want friends of his opponent to watch
    await api(server, "/api/account/settings", {
      method: "POST",
      headers: bearer(b),
      body: JSON.stringify({ friendsCanWatch: false }),
    });
    cf.send({ t: "watch", matchId });
    expect((await cf.next("error")).message).toBe("match not watchable");
  });

  it("spectators see changes only after the configured delay", async () => {
    server = await start({}, {}, {}, undefined, { spectatorDelay: { matchMs: 400 } });
    const [a, b, w] = [
      await register(server, "Ann"),
      await register(server, "Ben"),
      await register(server, "Wes"),
    ];
    const [ca, cb, cw] = [await connect(a), await connect(b), await connect(w)];
    ca.send({ t: "queue", variant: "backgammon", length: 1 });
    cb.send({ t: "queue", variant: "backgammon", length: 1 });
    const started = await ca.next("match-start");
    await new Promise((r) => setTimeout(r, 500));
    const first = cw.next("watch-state");
    cw.send({ t: "watch", matchId: started.matchId });
    const view = await first;
    expect(view.delayMs).toBe(400);
    expect(view.deadline).toBeNull();
    const t0 = Date.now();
    const ended = cw.next("watch-end", () => true, 3000);
    cb.send({ t: "action", action: { type: "resign", level: 1 } });
    await ended;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
  });

  it("an offline friend with notifications gets a push; the challenge waits for them", async () => {
    const got: string[] = [];
    const { createServer } = await import("node:http");
    const receiver = createServer((req, res) => {
      got.push(req.url ?? "");
      res.statusCode = 201;
      res.end();
    });
    await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
    const port = (receiver.address() as { port: number }).port;
    server = await start({}, {}, {}, undefined, {
      push: { allowEndpoint: () => true, subject: "mailto:t@example.com" },
    });
    const [a, b] = [await register(server, "Ann"), await register(server, "Ben")];
    await befriend(a, b);
    // a real P-256 public key is needed for the encryption
    const { createECDH } = await import("node:crypto");
    const keys = {
      p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
      auth: "a".repeat(22),
    };
    await api(server, "/api/push/subscribe", {
      method: "POST",
      headers: bearer(b),
      body: JSON.stringify({ endpoint: `http://127.0.0.1:${port}/push/b`, keys, lang: "de" }),
    });
    const ca = await connect(a);
    ca.send({ t: "challenge", playerId: b.id, variant: "portes", length: 1 });
    expect((await ca.next("challenge-update")).status).toBe("notified");
    for (let i = 0; i < 50 && got.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(got).toEqual(["/push/b"]);
    // Ben opens the app: the challenge is waiting
    const ws = await TestClient.connect(server);
    clients.push(ws);
    const challenge = ws.next("challenge");
    ws.send({ t: "hello", playerId: b.id, token: b.token });
    expect((await challenge).from.id).toBe(a.id);
    await new Promise((r) => receiver.close(r));
  });
});

describe("money sessions", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  it("run game after game unrated until a player ends them; the score decides", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const ca = await TestClient.connect(server, a);
    const cb = await TestClient.connect(server, b);
    clients.push(ca, cb);
    ca.send({ t: "queue", variant: "backgammon", length: 0 });
    cb.send({ t: "queue", variant: "backgammon", length: 0 });
    const started = await ca.next("match-start");
    expect(started.rated).toBe(false);
    expect(started.unratedReason).toBe("money");
    expect(started.config).toMatchObject({ length: 0, jacoby: true });
    // Ben resigns the first game: the session goes on with the next game
    const seatB = started.seat === 0 ? 1 : 0;
    const nextGame = ca.next(
      "state",
      (m) => m.match.results.length === 1 && m.match.game.result === null,
      5000,
    );
    cb.send({ t: "action", action: { type: "resign", level: 1 } });
    const s = await nextGame;
    expect(s.match.winner).toBeNull();
    expect(s.match.score[seatB]).toBe(0);
    // Ben ends the session while the second game runs: he concedes it, then the score decides
    const end = ca.next("match-end");
    cb.send({ t: "leave" });
    const e = await end;
    expect(e.reason).toBe("ended");
    expect(e.winner).toBe(started.seat);
    expect(e.ratingDelta).toEqual([0, 0]);
  });

  it("money cannot be played in tournaments", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const ca = await TestClient.connect(server, a);
    clients.push(ca);
    ca.send({ t: "tournament-create", name: "Cash", variant: "backgammon", length: 0 as 1, size: 4 });
    expect((await ca.next("error")).message).toBe("invalid message");
  });
});
