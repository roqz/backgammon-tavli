import type { ClubView, LeagueView, ProfileResponse, RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type FinishedMatch, Store } from "../src/db";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

const bearer = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("ratings by tempo", () => {
  it("blitz matches change the blitz rating only, with their own ranking and history", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    let n = 0;
    const match = (pool: FinishedMatch["pool"]) =>
      store.saveMatch({
        id: `m${n++}`,
        variant: "backgammon",
        length: 3,
        players: [a, b],
        winner: 0,
        score: [3, 0],
        reason: "won",
        games: [],
        startedAt: new Date().toISOString(),
        rated: true,
        ...(pool ? { pool } : {}),
      });
    match("blitz");
    match("blitz");
    match(undefined);
    const normal = store.rating(a, "backgammon");
    const blitz = store.rating(a, "backgammon", "blitz");
    expect(normal.matches).toBe(1);
    expect(blitz.matches).toBe(2);
    expect(blitz.rating).toBeGreaterThan(normal.rating);
    expect(store.leaderboard("backgammon", 50, "blitz").map((r) => [r.name, r.pool, r.matches])).toEqual([
      ["Ann", "blitz", 2],
      ["Ben", "blitz", 2],
    ]);
    expect(store.leaderboard("backgammon")[0]).toMatchObject({ name: "Ann", matches: 1 });
    const profile = store.profile(a)!;
    expect(profile.ratings.map((r) => [r.variant, r.pool ?? "normal", r.matches])).toEqual([
      ["backgammon", "normal", 1],
      ["backgammon", "blitz", 2],
    ]);
    // history per rating: start + one point per rated match
    expect(profile.history?.backgammon).toHaveLength(2);
    expect(profile.history?.["backgammon@blitz"]).toHaveLength(3);
    expect(store.publicPlayer(a, "backgammon", "blitz").rating).toBe(Math.round(blitz.rating));
  });
});

describe("league time control", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });
  const post = <T>(p: RegisterResponse, path: string, body: unknown = {}) =>
    api<T>(server, path, { method: "POST", headers: bearer(p), body: JSON.stringify(body) });

  it("live league matches use the league's clock; blitz leagues count for the blitz rating", async () => {
    server = await start();
    const a = await register(server, "Ann");
    const b = await register(server, "Ben");
    const c = await register(server, "Cid");
    await post(a, "/api/account/claim", { username: "ann_tc", password: "correct horse" });
    const club = await post<ClubView>(a, "/api/clubs", { name: "Blitz-Club", description: "", open: true });
    for (const p of [b, c]) await post(p, `/api/clubs/${club.id}/join`);
    const league = await post<LeagueView>(a, `/api/clubs/${club.id}/leagues`, {
      name: "Blitzliga",
      variant: "backgammon",
      length: 1,
      weeks: 1,
      clock: "blitz",
    });
    expect(league.clock).toBe("blitz");
    // correspondence leagues have no clock
    const corr = await post<LeagueView>(a, `/api/clubs/${club.id}/leagues`, {
      name: "Fern",
      variant: "backgammon",
      length: 1,
      weeks: 1,
      mode: "corr",
      clock: "blitz",
    });
    expect(corr.clock).toBe("relaxed");
    for (const p of [a, b, c]) await post(p, `/api/leagues/${league.id}/join`);
    await post(a, `/api/leagues/${league.id}/start`);
    const ca = await TestClient.connect(server, a);
    const cb = await TestClient.connect(server, b);
    clients.push(ca, cb);
    const incoming = cb.next("challenge");
    ca.send({
      t: "challenge",
      playerId: b.id,
      variant: "backgammon",
      length: 1,
      clock: "relaxed",
      leagueId: league.id,
    });
    const ch = await incoming;
    expect(ch).toMatchObject({ clock: "blitz" });
    const started = ca.next("match-start");
    cb.send({ t: "challenge-answer", id: ch.id, accept: true });
    expect(await started).toMatchObject({ timeControl: "blitz" });
    const end = ca.next("match-end");
    cb.send({ t: "action", action: { type: "resign", level: 1 } });
    await end;
    const profile = await api<ProfileResponse>(server, `/api/players/${a.id}`);
    expect(profile.ratings.find((r) => r.variant === "backgammon")?.pool).toBe("blitz");
  }, 30_000);
});
