import type { ClubView, CorrView, LeagueView, RegisterResponse, TournamentView } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { cutDivisions, nextSeasonName, promotionOrder } from "../src/clubs";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

const bearer = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("clubs and leagues", () => {
  let server: RunningServer;
  /** The pure unit test starts no server: do not close the previous one twice. */
  let closed: RunningServer | null = null;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    if (server !== closed) await server.close();
    closed = server;
  });
  const post = <T>(p: RegisterResponse, path: string, body: unknown = {}) =>
    api<T>(server, path, { method: "POST", headers: bearer(p), body: JSON.stringify(body) });
  const get = <T>(p: RegisterResponse, path: string) => api<T>(server, path, { headers: bearer(p) });
  const account = (p: RegisterResponse, username: string) =>
    post(p, "/api/account/claim", { username, password: "correct horse" });

  it("clubs: open and closed, roles, requests, search", async () => {
    server = await start({}, {}, {}, undefined, { tournaments: { guestMinMatches: 3 } });
    const [a, b, c] = [
      await register(server, "Ann"),
      await register(server, "Ben"),
      await register(server, "Cid"),
    ];
    // guests without matches cannot create clubs
    await expect(
      post(a, "/api/clubs", { name: "Tavli Freunde", description: "", open: true }),
    ).rejects.toThrow(/403/);
    await account(a, "ann_c");
    const open = await post<ClubView>(a, "/api/clubs", {
      name: "Tavli Freunde",
      description: "Hallo",
      open: true,
    });
    expect(open.myRole).toBe("owner");
    await expect(
      post(a, "/api/clubs", { name: "tavli freunde", description: "", open: true }),
    ).rejects.toThrow(/409/);
    expect((await post<ClubView>(b, `/api/clubs/${open.id}/join`)).myRole).toBe("member");
    const closed = await post<ClubView>(a, "/api/clubs", {
      name: "Geheimbund",
      description: "",
      open: false,
    });
    expect((await post<ClubView>(c, `/api/clubs/${closed.id}/join`)).myRole).toBe("pending");
    // members cannot approve, the owner can
    await expect(
      post(b, `/api/clubs/${closed.id}/manage`, { playerId: c.id, action: "approve" }),
    ).rejects.toThrow(/403/);
    const approved = await post<ClubView>(a, `/api/clubs/${closed.id}/manage`, {
      playerId: c.id,
      action: "approve",
    });
    expect(approved.memberList.find((m) => m.player.id === c.id)?.role).toBe("member");
    expect((await get<{ name: string }[]>(c, "/api/clubs?q=geheim")).map((x) => x.name)).toEqual([
      "Geheimbund",
    ]);
    expect((await get<{ name: string }[]>(b, "/api/clubs")).map((x) => x.name)).toEqual(["Tavli Freunde"]);
    // the owner leaves: the club passes to the longest member
    await post(a, `/api/clubs/${open.id}/leave`);
    expect((await get<ClubView>(b, `/api/clubs/${open.id}`)).myRole).toBe("owner");
  });

  it("a league: every pairing once, played live from the table, champion at the end", async () => {
    server = await start();
    const names = ["Ann", "Ben", "Cid"];
    const ps: RegisterResponse[] = [];
    for (const n of names) ps.push(await register(server, n));
    const [a, b, c] = ps as [RegisterResponse, RegisterResponse, RegisterResponse];
    await account(a, "ann_l");
    const club = await post<ClubView>(a, "/api/clubs", { name: "Liga-Club", description: "", open: true });
    for (const p of [b, c]) await post(p, `/api/clubs/${club.id}/join`);
    await expect(
      post(b, `/api/clubs/${club.id}/leagues`, { name: "Herbst", variant: "portes", length: 1, weeks: 2 }),
    ).rejects.toThrow(/403/);
    const league = await post<LeagueView>(a, `/api/clubs/${club.id}/leagues`, {
      name: "Herbst",
      variant: "portes",
      length: 1,
      weeks: 2,
    });
    for (const p of ps) await post(p, `/api/leagues/${league.id}/join`);
    const started = await post<LeagueView>(a, `/api/leagues/${league.id}/start`);
    expect(started.status).toBe("running");
    expect(started.matches).toHaveLength(3);

    const conns = new Map<string, TestClient>();
    for (const p of ps) {
      const tc = await TestClient.connect(server, p);
      clients.push(tc);
      conns.set(p.id, tc);
    }
    // the challenger asks for backgammon, the league decides: portes, 1 point
    const play = async (x: RegisterResponse, y: RegisterResponse, loser: RegisterResponse) => {
      const cx = conns.get(x.id)!;
      const cy = conns.get(y.id)!;
      const incoming = cy.next("challenge");
      cx.send({ t: "challenge", playerId: y.id, variant: "backgammon", length: 7, leagueId: league.id });
      const ch = await incoming;
      expect(ch).toMatchObject({ variant: "portes", length: 1 });
      const startX = cx.next("match-start");
      cy.send({ t: "challenge-answer", id: ch.id, accept: true });
      await startX;
      const end = cx.next("match-end");
      conns.get(loser.id)!.send({ t: "action", action: { type: "resign", level: 1 } });
      await end;
    };
    await play(a, b, b);
    // the same pairing cannot be played again
    conns
      .get(a.id)!
      .send({ t: "challenge", playerId: b.id, variant: "portes", length: 1, leagueId: league.id });
    expect((await conns.get(a.id)!.next("error")).message).toBe("no open league match");
    await play(a, c, c);
    await play(b, c, b);
    const done = await get<LeagueView>(c, `/api/leagues/${league.id}`);
    expect(done.status).toBe("finished");
    expect(done.winner?.id).toBe(a.id);
    expect(done.standings.map((s) => [s.player.name, s.points])).toEqual([
      ["Ann", 4],
      ["Cid", 2],
      ["Ben", 0],
    ]);
  }, 30_000);

  it("promotion order, divisions and season names", () => {
    // 4 and 4: one player each goes up and down
    expect(
      promotionOrder([
        ["a1", "a2", "a3", "a4"],
        ["b1", "b2", "b3", "b4"],
      ]),
    ).toEqual(["a1", "a2", "a3", "b1", "a4", "b2", "b3", "b4"]);
    // 6 and 6: two each
    const top = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const low = ["b1", "b2", "b3", "b4", "b5", "b6"];
    const [d1, d2] = cutDivisions(promotionOrder([top, low]), 2);
    expect(d1).toEqual(["a1", "a2", "a3", "a4", "b1", "b2"]);
    expect(d2).toEqual(["a5", "a6", "b3", "b4", "b5", "b6"]);
    // three divisions: the middle one moves both ways
    const order = promotionOrder([
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"],
      ["c1", "c2", "c3"],
    ]);
    expect(cutDivisions(order, 3)).toEqual([
      ["a1", "a2", "b1"],
      ["a3", "b2", "c1"],
      ["b3", "c2", "c3"],
    ]);
    expect(cutDivisions([1, 2, 3, 4, 5, 6, 7], 2)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ]);
    expect(nextSeasonName("Saison 1")).toBe("Saison 2");
    expect(nextSeasonName("Herbst")).toBe("Herbst 2");
  });

  /** A club with an account owner and the other players as members. */
  const clubWith = async (names: string[], username: string) => {
    const ps: RegisterResponse[] = [];
    for (const n of names) ps.push(await register(server, n));
    await account(ps[0]!, username);
    const club = await post<ClubView>(ps[0]!, "/api/clubs", {
      name: `Club ${username}`,
      description: "",
      open: true,
    });
    for (const p of ps.slice(1)) await post(p, `/api/clubs/${club.id}/join`);
    return { ps, club };
  };
  /** Correspondence game of two players in a league. */
  const corrGame = async (p: RegisterResponse, opponent: string, league: string) => {
    const list = await get<CorrView[]>(p, "/api/corr");
    const g = list.find(
      (x) => x.league?.id === league && x.status === "active" && x.players.some((y) => y.id === opponent),
    );
    if (!g) throw new Error("no league game");
    return g;
  };
  const resign = (p: RegisterResponse, game: CorrView) =>
    post(p, `/api/corr/${game.id}/action`, { action: { type: "resign", level: 1 } });

  it("a correspondence league: all games start at once, results go to the table", async () => {
    server = await start();
    const { ps, club } = await clubWith(["Ann", "Ben", "Cid"], "ann_corr");
    const [a, b, c] = ps as [RegisterResponse, RegisterResponse, RegisterResponse];
    const league = await post<LeagueView>(a, `/api/clubs/${club.id}/leagues`, {
      name: "Fernliga",
      variant: "plakoto",
      length: 1,
      weeks: 4,
      mode: "corr",
      days: 7,
    });
    expect(league).toMatchObject({ mode: "corr", days: 7 });
    for (const p of ps) await post(p, `/api/leagues/${league.id}/join`);
    const started = await post<LeagueView>(a, `/api/leagues/${league.id}/start`);
    expect(started.matches.map((m) => m.status)).toEqual(["playing", "playing", "playing"]);
    // no friendship needed; the game carries the league
    const ab = await corrGame(a, b.id, league.id);
    expect(ab).toMatchObject({ variant: "plakoto", days: 7, league: { name: "Fernliga" } });
    // live challenges are not used in a correspondence league
    const tc = await TestClient.connect(server, a);
    clients.push(tc);
    tc.send({ t: "challenge", playerId: b.id, variant: "plakoto", length: 1, leagueId: league.id });
    expect((await tc.next("error")).message).toBe("no open league match");

    await resign(b, ab);
    await resign(c, await corrGame(c, a.id, league.id));
    let view = await get<LeagueView>(a, `/api/leagues/${league.id}`);
    expect(view.status).toBe("running");
    expect(view.standings[0]).toMatchObject({ id: a.id, points: 4, division: 1, move: null });
    // a missed deadline also counts: Ben does not answer
    const bc = await corrGame(b, c.id, league.id);
    const late = bc.toAct === 0 ? bc.players[0].id : bc.players[1].id;
    server.corr.tick(Date.now() + 8 * 24 * 60 * 60 * 1000);
    view = await get<LeagueView>(a, `/api/leagues/${league.id}`);
    expect(view.status).toBe("finished");
    expect(view.winner?.id).toBe(a.id);
    expect(view.standings.find((s) => s.id === late)?.losses).toBe(2);
  }, 30_000);

  it("the season ends: open correspondence games end without a result", async () => {
    server = await start();
    const { ps, club } = await clubWith(["Ann", "Ben", "Cid"], "ann_end");
    const [a, b] = ps as [RegisterResponse, RegisterResponse];
    const league = await post<LeagueView>(a, `/api/clubs/${club.id}/leagues`, {
      name: "Kurz",
      variant: "portes",
      length: 3,
      weeks: 1,
      mode: "corr",
      days: 3,
    });
    for (const p of ps) await post(p, `/api/leagues/${league.id}/join`);
    await post(a, `/api/leagues/${league.id}/start`);
    const g = await corrGame(a, b.id, league.id);
    server.lobby.clubs.tick(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const after = await get<CorrView>(a, `/api/corr/${g.id}`);
    expect(after).toMatchObject({ status: "finished", winner: null, reason: "ended" });
    const view = await get<LeagueView>(a, `/api/leagues/${league.id}`);
    expect(view.status).toBe("finished");
    expect(view.winner).toBeNull();
  }, 30_000);

  it("divisions: seeded by rating, next season with promotion and relegation", async () => {
    server = await start();
    const names = ["P1", "P2", "P3", "P4", "P5", "P6"];
    const { ps, club } = await clubWith(names, "p1_div");
    const admin = ps[0]!;
    const league = await post<LeagueView>(admin, `/api/clubs/${club.id}/leagues`, {
      name: "Saison 1",
      variant: "backgammon",
      length: 1,
      weeks: 4,
      mode: "corr",
      divisions: 2,
    });
    for (const p of ps.slice(0, 5)) await post(p, `/api/leagues/${league.id}/join`);
    // 3 players per division at least
    await expect(post(admin, `/api/leagues/${league.id}/start`)).rejects.toThrow(/409/);
    await post(ps[5]!, `/api/leagues/${league.id}/join`);
    const started = await post<LeagueView>(admin, `/api/leagues/${league.id}/start`);
    expect(started.matches).toHaveLength(6);
    const divisionOf = (v: LeagueView, id: string) => v.standings.find((s) => s.id === id)!.division;
    const d1 = ps.filter((p) => divisionOf(started, p.id) === 1);
    const d2 = ps.filter((p) => divisionOf(started, p.id) === 2);
    expect([d1.length, d2.length]).toEqual([3, 3]);
    // in each division the first player wins everything, the last loses everything
    for (const div of [d1, d2]) {
      const [x, y, z] = div as [RegisterResponse, RegisterResponse, RegisterResponse];
      await resign(y, await corrGame(y, x.id, league.id));
      await resign(z, await corrGame(z, x.id, league.id));
      await resign(z, await corrGame(z, y.id, league.id));
    }
    const done = await get<LeagueView>(admin, `/api/leagues/${league.id}`);
    expect(done.status).toBe("finished");
    expect(done.winner?.id).toBe(d1[0]!.id);
    expect(done.standings.map((s) => s.move)).toEqual([null, null, "down", "up", null, null]);
    // only admins start the next season; it takes over the entrants
    await expect(post(ps[1]!, `/api/leagues/${league.id}/next`)).rejects.toThrow(/403/);
    const next = await post<LeagueView>(admin, `/api/leagues/${league.id}/next`);
    expect(next).toMatchObject({
      name: "Saison 2",
      status: "open",
      divisions: 2,
      mode: "corr",
      previousId: league.id,
    });
    expect(next.entries).toHaveLength(6);
    expect((await get<LeagueView>(admin, `/api/leagues/${league.id}`)).nextId).toBe(next.id);
    const second = await post<LeagueView>(admin, `/api/leagues/${next.id}/start`);
    expect(divisionOf(second, d2[0]!.id)).toBe(1);
    expect(divisionOf(second, d1[2]!.id)).toBe(2);
    expect(divisionOf(second, d1[0]!.id)).toBe(1);
    expect(divisionOf(second, d2[2]!.id)).toBe(2);
  }, 60_000);

  it("club tournaments: created by admins, only members join and see them", async () => {
    server = await start({}, {}, {}, undefined, { tournaments: { guestMinMatches: 3 } });
    const { ps, club } = await clubWith(["Ann", "Ben"], "ann_t");
    const [a, b] = ps as [RegisterResponse, RegisterResponse];
    const outsider = await register(server, "Ole");
    const [ca, cb, co] = [
      await TestClient.connect(server, a),
      await TestClient.connect(server, b),
      await TestClient.connect(server, outsider),
    ];
    clients.push(ca, cb, co);
    // a member who is not an admin cannot create one
    cb.send({
      t: "tournament-create",
      name: "Clubcup",
      variant: "backgammon",
      length: 1,
      size: 4,
      clubId: club.id,
    });
    expect((await cb.next("error")).message).toBe("only club admins can do that");
    ca.send({
      t: "tournament-create",
      name: "Clubcup",
      variant: "backgammon",
      length: 1,
      size: 4,
      clubId: club.id,
    });
    const created = (await ca.next("tournament")).tournament as TournamentView;
    expect(created.club).toEqual({ id: club.id, name: club.name });
    co.send({ t: "tournament-join", id: created.id });
    expect((await co.next("error")).message).toBe("members only");
    cb.send({ t: "tournament-join", id: created.id });
    expect(((await cb.next("tournament")).tournament as TournamentView).players).toHaveLength(2);
    // visible to members (list and club page), not to others
    const ids = async (p: RegisterResponse) =>
      (await get<TournamentView[]>(p, "/api/tournaments")).map((t) => t.id);
    expect(await ids(b)).toContain(created.id);
    expect(await ids(outsider)).not.toContain(created.id);
    expect((await api<TournamentView[]>(server, "/api/tournaments")).map((t) => t.id)).not.toContain(
      created.id,
    );
    expect((await get<ClubView>(b, `/api/clubs/${club.id}`)).tournaments.map((t) => t.id)).toEqual([
      created.id,
    ]);
    expect((await get<ClubView>(outsider, `/api/clubs/${club.id}`)).tournaments).toEqual([]);
  }, 30_000);
});
