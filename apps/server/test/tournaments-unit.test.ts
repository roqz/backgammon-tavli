import type { MatchVariantId, TournamentRef } from "@tavli/protocol";
import { describe, expect, it } from "vitest";
import { Store } from "../src/db";
import { type TournamentHost, Tournaments } from "../src/tournaments";

/** A lobby stand-in: every player is online; started matches are collected for the test to decide. */
const stubHost = () => {
  const started: { ref: TournamentRef; slot: number; p0: string; p1: string }[] = [];
  const host: TournamentHost = {
    isAvailable: () => true,
    startTournamentMatch: (
      _v: MatchVariantId,
      _l: number,
      p0: string,
      p1: string,
      ref: TournamentRef,
      slot: number,
    ) => {
      started.push({ ref, slot, p0, p1 });
      return `room-${started.length}`;
    },
    push: () => {},
  };
  return { host, started };
};

const setup = (n: number, store = new Store(":memory:")) => {
  const players = Array.from({ length: n }, (_, i) => store.createPlayer(`P${i + 1}`).id);
  return { store, players };
};

describe("tournaments (unit)", () => {
  it("plays a 16-player Swiss over four rounds without rematches", () => {
    const { store, players } = setup(16);
    const { host, started } = stubHost();
    const t = new Tournaments(store, host, { startDelayMs: 0, guestMinMatches: 0 });
    const view = t.create(players[0]!, "Big Swiss", "portes", 1, 16, "swiss");
    for (const p of players.slice(1)) t.join(p, view.id);
    for (let round = 0; round < 4; round++) {
      t.tick();
      const games = started.filter((s) => s.ref.round === round);
      expect(games).toHaveLength(8);
      // the better-ranked player (p0) always wins
      for (const g of games) t.matchEnded(g.ref, g.slot, g.p0, [1, 0]);
    }
    const done = t.view(view.id)!;
    expect(done.status).toBe("finished");
    expect(done.rounds).toHaveLength(4);
    const pairs = done.rounds.flat().map((m) => [...m.players].sort().join());
    expect(new Set(pairs).size).toBe(pairs.length);
    const table = done.standings!;
    expect(table.reduce((s, r) => s + r.wins, 0)).toBe(32);
    expect(table.every((r) => r.played === 4)).toBe(true);
    expect(done.winner).toBe(table[0]!.id);
    expect(table[0]!.wins).toBe(4);
    store.close();
  });

  it("a match running during a restart is played again", () => {
    const { store, players } = setup(4);
    const first = stubHost();
    const t1 = new Tournaments(store, first.host, { startDelayMs: 0, guestMinMatches: 0 });
    const v = t1.create(players[0]!, "Cup", "backgammon", 1, 4);
    for (const p of players.slice(1)) t1.join(p, v.id);
    t1.tick();
    expect(first.started).toHaveLength(2);
    expect(t1.view(v.id)!.rounds[0]!.every((m) => m.status === "playing")).toBe(true);
    // server restart: a new manager on the same database
    const second = stubHost();
    const t2 = new Tournaments(store, second.host, { startDelayMs: 0, guestMinMatches: 0 });
    expect(t2.view(v.id)!.rounds[0]!.every((m) => m.status === "ready" && m.matchId === null)).toBe(true);
    t2.tick();
    expect(second.started).toHaveLength(2);
    store.close();
  });

  it("open tournaments expire; a withdrawn Swiss player is no longer paired", () => {
    const { store, players } = setup(4);
    const { host, started } = stubHost();
    const t = new Tournaments(store, host, { startDelayMs: 0, guestMinMatches: 0, openTtlMs: -1 });
    const stale = t.create(players[0]!, "Stale", "backgammon", 1, 4);
    t.tick();
    expect(t.view(stale.id)!.status).toBe("cancelled");

    const t2 = new Tournaments(store, host, { startDelayMs: 0, guestMinMatches: 0 });
    const v = t2.create(players[0]!, "Swiss", "backgammon", 1, 4, "swiss");
    for (const p of players.slice(1)) t2.join(p, v.id);
    t2.tick();
    // P4 withdraws during round 1 (and loses the running game); afterwards only three remain
    t2.leave(players[3]!, v.id);
    for (const g of started.filter((x) => x.ref.id === v.id)) {
      const winner = g.p0 === players[3] ? g.p1 : g.p0;
      t2.matchEnded(g.ref, g.slot, winner, [1, 0]);
    }
    t2.tick();
    const round1 = t2.view(v.id)!.rounds[1]!;
    // three players left: one game and a bye
    expect(round1.filter((m) => m.players[1] !== null)).toHaveLength(1);
    expect(round1.filter((m) => m.players[1] === null)).toHaveLength(1);
    expect(round1.flat().some((m) => m.players.includes(players[3]!))).toBe(false);
    store.close();
  });

  it("guests need finished matches before creating; open tournaments are capped", () => {
    const { store, players } = setup(3);
    const { host } = stubHost();
    const t = new Tournaments(store, host, { guestMinMatches: 1, maxOpen: 1 });
    expect(() => t.create(players[0]!, "A", "backgammon", 1, 4)).toThrow(/matches or create an account/);
    const t2 = new Tournaments(store, host, { guestMinMatches: 0, maxOpen: 1 });
    t2.create(players[0]!, "A", "backgammon", 1, 4);
    expect(() => t2.create(players[1]!, "B", "backgammon", 1, 4)).toThrow(/too many open/);
    store.close();
  });
});
