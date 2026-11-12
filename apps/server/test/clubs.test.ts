import type { ClubView, LeagueView, RegisterResponse } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { api, register, start, TestClient } from "./helpers";

const bearer = (p: RegisterResponse) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

describe("clubs and leagues", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
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
});
