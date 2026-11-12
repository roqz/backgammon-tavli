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
