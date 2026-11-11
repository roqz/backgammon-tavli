import { playerToAct } from "@tavli/engine";
import type { LeaderboardEntry, ServerMessage } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { ReportRow } from "../src/db";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

type State = Extract<ServerMessage, { t: "state" }>;
const ADMIN = "admin-secret-for-tests-0123";

describe("resignation offers, emotes and moderation", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  const setup = async (cubeMs = 5_000) => {
    server = await start({ cubeMs }, {}, {}, undefined, { adminToken: ADMIN });
    const pa = await register(server, "Alice");
    const pb = await register(server, "Bob");
    const a = await TestClient.connect(server, pa);
    const b = await TestClient.connect(server, pb);
    clients.push(a, b);
    const state = a.next("state");
    a.send({ t: "create", variant: "backgammon", length: 3 });
    const { code } = await a.next("room-created");
    b.send({ t: "join", code });
    const first = await state;
    const seats: [TestClient, TestClient] = [a, b];
    return { a, b, pa, pb, seats, first, matchId: a.last("match-start")!.matchId };
  };

  /** The client on turn (the opening roll is played by the winner, so someone is always to act). */
  const actorOf = (seats: [TestClient, TestClient], s: State) => {
    const actor = playerToAct(s.match.game)!;
    return { actor, me: seats[actor], other: seats[actor === 0 ? 1 : 0] };
  };

  it("the opponent rejects; one offer per turn; resigning without an offer concedes the maximum", async () => {
    const { seats, first } = await setup();
    const { actor, me, other } = actorOf(seats, first);
    const offered = other.next("state", (s) => !!s.match.game.resignOffer);
    me.send({ t: "action", action: { type: "offer-resign", level: 1 } });
    expect((await offered).match.game.resignOffer).toEqual({ player: actor, level: 1 });

    const rejected = me.next("state", (s) => s.action?.type === "reject-resign");
    other.send({ t: "action", action: { type: "reject-resign" } });
    expect((await rejected).match.game.resignOffer).toBeNull();
    me.send({ t: "action", action: { type: "offer-resign", level: 2 } });
    expect((await me.next("error")).message).toMatch(/one offer per turn/);

    // resigning without an offer concedes the highest possible result
    const end = me.next("match-end");
    me.send({ t: "action", action: { type: "resign", level: 1 } });
    await end;
    expect(me.last("state")!.match.results[0]).toMatchObject({ level: 3, reason: "resign" });
  });

  it("an accepted offer ends the game with the offered result", async () => {
    const { seats, first } = await setup();
    const { actor, me, other } = actorOf(seats, first);
    const ended = me.next("state", (s) => s.match.results.length === 1);
    me.send({ t: "action", action: { type: "offer-resign", level: 2 } });
    await other.next("state", (s) => !!s.match.game.resignOffer);
    other.send({ t: "action", action: { type: "accept-resign" } });
    const done = await ended;
    expect(done.match.results[0]).toMatchObject({ winner: actor === 0 ? 1 : 0, level: 2, reason: "resign" });
    expect(done.match.score[actor === 0 ? 1 : 0]).toBe(2);
  });

  it("an unanswered offer is decided by the bot when time runs out", async () => {
    const { seats, first } = await setup(300);
    const { me, other } = actorOf(seats, first);
    const end = other.next("state", (s) => s.match.results.length === 1, 3_000);
    me.send({ t: "action", action: { type: "offer-resign", level: 1 } });
    // from the opening position a sure point is better than playing on
    expect((await end).match.results[0]).toMatchObject({ level: 1, reason: "resign" });
  });

  it("relays emotes to both players with a small rate limit", async () => {
    const { a, b } = await setup();
    const got = b.next("emote");
    a.send({ t: "emote", id: "gl" });
    expect(await got).toEqual({ t: "emote", seat: 0, id: "gl" });
    a.send({ t: "emote", id: "gg" });
    await new Promise((r) => setTimeout(r, 200));
    expect(b.messages.filter((m) => m.t === "emote")).toHaveLength(1);
  });

  it("reports opponents only, and moderators can review and ban", async () => {
    const { a, pa, pb, matchId } = await setup();
    const auth = (p: { id: string; token: string }) => ({ Authorization: `Bearer ${p.id}.${p.token}` });
    const report = (body: object) =>
      api<{ duplicate: boolean }>(server, "/api/reports", {
        method: "POST",
        headers: auth(pa),
        body: JSON.stringify(body),
      });

    const stranger = await register(server, "Eve");
    await expect(report({ playerId: stranger.id, matchId, reason: "abuse" })).rejects.toThrow(/403/);
    await expect(report({ playerId: pb.id, reason: "abuse" })).rejects.toThrow(/403/);
    expect(await report({ playerId: pb.id, matchId, reason: "stalling", note: "waits every turn" })).toEqual({
      ok: true,
      duplicate: false,
    });
    expect((await report({ playerId: pb.id, matchId, reason: "stalling" })).duplicate).toBe(true);

    const admin = { "X-Admin-Token": ADMIN };
    await expect(
      api(server, "/api/admin/reports", { headers: { "X-Admin-Token": "wrong-token-wrong-token" } }),
    ).rejects.toThrow(/401/);
    const open = await api<ReportRow[]>(server, "/api/admin/reports", { headers: admin });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      reason: "stalling",
      reported: { id: pb.id, name: "Bob", banned: false },
    });

    // banning disconnects the player and keeps them out
    const b = clients[1]!;
    const kicked = b.next("error", (m) => m.message === "banned");
    await api(server, `/api/admin/players/${pb.id}/ban`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ reason: "stalling" }),
    });
    await kicked;
    const again = await TestClient.connect(server);
    clients.push(again);
    again.send({ t: "hello", playerId: pb.id, token: pb.token });
    expect((await again.next("error")).message).toBe("banned");
    await expect(
      api(server, "/api/players/me", {
        method: "PATCH",
        headers: auth(pb),
        body: JSON.stringify({ name: "B" }),
      }),
    ).rejects.toThrow(/403/);
    // the running match is forfeited after the grace period
    const end = await a.next("match-end", () => true, 5_000);
    expect(end.reason).toBe("abandoned");
    const board = await api<LeaderboardEntry[]>(server, "/api/leaderboard?variant=backgammon");
    expect(board.some((e) => e.playerId === pb.id)).toBe(false);

    await api(server, `/api/admin/reports/${open[0]!.id}/resolve`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ resolution: "banned" }),
    });
    expect(await api<ReportRow[]>(server, "/api/admin/reports", { headers: admin })).toHaveLength(0);
    const info = await api<{ bannedAt: string | null }>(server, `/api/admin/players/${pb.id}/ban`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ reason: null }),
    });
    expect(info.bannedAt).toBeNull();
  });

  it("the moderation API is off without a token", async () => {
    server = await start();
    await expect(api(server, "/api/admin/reports", { headers: { "X-Admin-Token": ADMIN } })).rejects.toThrow(
      /404/,
    );
  });
});
