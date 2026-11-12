import type { RegisterResponse, ServerMessage, TournamentView } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { seedOrder, swissPairs, swissStandings } from "../src/tournaments";
import { api, register, start, TestClient } from "./helpers";

type Start = Extract<ServerMessage, { t: "match-start" }>;

describe("bracket", () => {
  it("seeds so that the best players meet last", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("swiss", () => {
  const pairsOf = (games: [string, string][]) => (a: string, b: string) =>
    games.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  it("pairs top-down without rematches, backtracking when needed", () => {
    expect(swissPairs(["a", "b", "c", "d"], () => false).pairs).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    // a met b and c met d: a–c, b–d
    expect(
      swissPairs(
        ["a", "b", "c", "d"],
        pairsOf([
          ["a", "b"],
          ["c", "d"],
        ]),
      ).pairs,
    ).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
    // greedy a–c would leave b–d (already met): backtrack to a–d, b–c
    expect(
      swissPairs(
        ["a", "b", "c", "d"],
        pairsOf([
          ["a", "b"],
          ["b", "d"],
        ]),
      ).pairs,
    ).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
  });

  it("gives the bye to the lowest player who has not had one", () => {
    const r = swissPairs(
      ["a", "b", "c", "d", "e"],
      () => false,
      (p) => p === "e",
    );
    expect(r.bye).toBe("d");
    expect(r.pairs.flat().sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("ranks by wins, then Buchholz, then seed", () => {
    const players = ["a", "b", "c", "d"].map((id, i) => ({ id, seed: i + 1 }));
    const m = (p0: string, p1: string | null, winner: string | null) => ({ p0, p1, status: "done", winner });
    const table = swissStandings(players, [
      m("a", "b", "b"),
      m("c", "d", "c"),
      m("b", "c", "c"),
      m("a", "d", "d"),
    ]);
    // c 2 wins; b and d 1 win each: b beat a (0 wins) and lost to c (2) → Buchholz 2; d beat a, lost to c → 2; seed decides
    expect(table.map((r) => [r.id, r.wins, r.buchholz])).toEqual([
      ["c", 2, 2],
      ["b", 1, 2],
      ["d", 1, 2],
      ["a", 0, 2],
    ]);
  });
});

describe("tournaments", () => {
  let server: RunningServer;
  const clients: TestClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
  });

  const setup = async (names: string[], noShowMs = 60_000, startDelayMs = 0) => {
    server = await start({}, {}, {}, undefined, { tournaments: { startDelayMs, noShowMs } });
    const players: RegisterResponse[] = [];
    const conns: TestClient[] = [];
    for (const n of names) {
      const p = await register(server, n);
      const c = await TestClient.connect(server, p);
      players.push(p);
      conns.push(c);
      clients.push(c);
    }
    return { players, conns };
  };

  const create = async (c: TestClient, size: 4 | 8 = 4) => {
    c.send({ t: "tournament-create", name: "Cup", variant: "backgammon", length: 1, size });
    return (await c.next("tournament")).tournament;
  };

  const view = (id: string) => api<TournamentView>(server, `/api/tournaments/${id}`);

  it("runs a 4-player knockout to the end", async () => {
    const { players, conns } = await setup(["A", "B", "C", "D"]);
    const t = await create(conns[0]!);
    expect(t.status).toBe("open");
    const starts = conns.map((c) => c.next("match-start"));
    for (const c of conns.slice(1)) c.send({ t: "tournament-join", id: t.id });
    const first = (await Promise.all(starts)) as Start[];
    expect(first.every((s) => s.tournament?.id === t.id && s.tournament.round === 0)).toBe(true);

    // In each first-round match seat 1 resigns; seat 0 goes through.
    const finalists = conns.filter((_, i) => first[i]!.seat === 0);
    const finalStarts = finalists.map((c) => c.next("match-start", (m) => m.tournament?.round === 1, 8000));
    for (const [i, c] of conns.entries()) {
      if (first[i]!.seat === 1) c.send({ t: "action", action: { type: "resign", level: 1 } });
    }
    const final = await Promise.all(finalStarts);
    expect(final[0]!.matchId).toBe(final[1]!.matchId);
    const loser = finalists[final[0]!.seat === 1 ? 0 : 1]!;
    const champion = finalists[final[0]!.seat === 1 ? 1 : 0]!;
    const done = champion.next("tournament", (m) => m.tournament.status === "finished", 8000);
    loser.send({ t: "action", action: { type: "resign", level: 1 } });
    const finished = (await done).tournament;
    const championId = players[conns.indexOf(champion)]!.id;
    expect(finished.winner).toBe(championId);
    expect(finished.rounds.map((r) => r.length)).toEqual([2, 1]);
    expect(finished.rounds.flat().every((m) => m.status === "done" && !m.walkover)).toBe(true);
    expect((await view(t.id)).status).toBe("finished");
    const list = await api<TournamentView[]>(server, "/api/tournaments");
    expect(list.map((x) => x.id)).toContain(t.id);
  }, 30_000);

  it("runs a 4-player Swiss tournament over three rounds without rematches", async () => {
    const { players, conns } = await setup(["A", "B", "C", "D"]);
    conns[0]!.send({
      t: "tournament-create",
      name: "Swiss",
      variant: "backgammon",
      length: 1,
      size: 4,
      format: "swiss",
    });
    const t = (await conns[0]!.next("tournament")).tournament;
    expect(t.format).toBe("swiss");
    expect(t.roundCount).toBe(3);
    let starts = conns.map((c) => c.next("match-start"));
    for (const c of conns.slice(1)) c.send({ t: "tournament-join", id: t.id });
    for (let round = 0; round < 3; round++) {
      const s = (await Promise.all(starts)) as Start[];
      expect(s.every((x) => x.tournament?.round === round && x.tournament.format === "swiss")).toBe(true);
      const last = round === 2;
      starts = last
        ? []
        : conns.map((c) => c.next("match-start", (m) => m.tournament?.round === round + 1, 8000));
      const done = conns[0]!.next(
        "tournament",
        (m) => (last ? m.tournament.status === "finished" : m.tournament.rounds.length === round + 2),
        8000,
      );
      // the player in seat 1 resigns every match
      for (const [i, c] of conns.entries())
        if (s[i]!.seat === 1) c.send({ t: "action", action: { type: "resign", level: 1 } });
      const v = (await done).tournament;
      if (last) {
        const pairs = v.rounds.flat().map((m) => [...m.players].sort().join());
        expect(new Set(pairs).size).toBe(6); // a full round robin
        expect(v.standings!.reduce((n, r) => n + r.wins, 0)).toBe(6);
        expect(v.winner).toBe(v.standings![0]!.id);
        expect(players.map((p) => p.id)).toContain(v.winner);
      }
    }
  }, 40_000);

  it("an absent player loses by walkover, a withdrawn one at once", async () => {
    const { conns } = await setup(["A", "B", "C", "D"], 300, 500);
    const [a, b, c, d] = conns as [TestClient, TestClient, TestClient, TestClient];
    const t = await create(a);
    b.send({ t: "tournament-join", id: t.id });
    await b.next("tournament");
    // D joins and goes offline while the tournament is still open
    d.send({ t: "tournament-join", id: t.id });
    await d.next("tournament");
    await d.close();
    // C completes the bracket (seeds by join order at equal ratings: A, B, D, C → A–C, B–D) and withdraws at once
    const running = a.next("tournament", (m) => m.tournament.status === "running");
    c.send({ t: "tournament-join", id: t.id });
    await running;
    c.send({ t: "tournament-leave", id: t.id });
    const finalReady = await a.next(
      "tournament",
      (m) => m.tournament.rounds[0]!.every((x) => x.status === "done"),
      8000,
    );
    const r0 = finalReady.tournament.rounds[0]!;
    const name = (id: string | null) => finalReady.tournament.players.find((p) => p.id === id)?.name;
    expect(r0.map((m) => [name(m.winner), m.walkover])).toEqual([
      ["A", true],
      ["B", true],
    ]);
    expect(finalReady.tournament.players.find((p) => p.name === "C")?.withdrawn).toBe(true);
    // the final between the two present players starts
    expect((await a.next("match-start", () => true, 8000)).tournament?.round).toBe(1);
  }, 30_000);

  it("one active tournament per player; leaving an open one, the last player cancels it", async () => {
    const { conns } = await setup(["A", "B"]);
    const t = await create(conns[0]!);
    conns[0]!.send({ t: "tournament-create", name: "Second", variant: "portes", length: 3, size: 4 });
    expect((await conns[0]!.next("error")).message).toMatch(/already in a tournament/);
    conns[1]!.send({ t: "tournament-join", id: t.id });
    expect((await conns[1]!.next("tournament")).tournament.players).toHaveLength(2);
    conns[1]!.send({ t: "tournament-leave", id: t.id });
    expect((await conns[1]!.next("tournament")).tournament.players).toHaveLength(1);
    conns[0]!.send({ t: "tournament-leave", id: t.id });
    expect((await conns[0]!.next("tournament")).tournament.status).toBe("cancelled");
  });
});
