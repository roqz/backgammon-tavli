import type { MatchVariantId, TournamentRef } from "@tavli/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Clubs } from "../src/clubs";
import { Store } from "../src/db";
import { type TournamentHost, Tournaments } from "../src/tournaments";

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

const HOUR = 60 * 60_000;

describe("scheduled tournaments", () => {
  afterEach(() => vi.useRealTimers());

  it("take entries until the start time, then start with byes for the best seeds", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T18:00:00Z") });
    const store = new Store(":memory:");
    const players = Array.from({ length: 5 }, (_, i) => store.createPlayer(`P${i + 1}`).id);
    for (const [i, p] of players.entries()) store.setRating(p, "backgammon", 1600 - i * 10);
    const { host, started } = stubHost();
    const t = new Tournaments(store, host, { startDelayMs: 0, guestMinMatches: 0 });
    expect(() =>
      t.create(players[0]!, "Zu früh", "backgammon", 1, 16, "knockout", null, "relaxed", Date.now() + 60_000),
    ).toThrow(/start time/);
    const view = t.create(
      players[0]!,
      "Freitagsturnier",
      "backgammon",
      1,
      16,
      "knockout",
      null,
      "relaxed",
      Date.now() + HOUR,
    );
    expect(view.startsAt).toBe(Date.now() + HOUR);
    // entering does not block other tournaments before the start
    const other = t.create(players[1]!, "Sofort", "backgammon", 1, 4);
    expect(other.status).toBe("open");
    t.leave(players[1]!, other.id);
    for (const p of players.slice(1)) t.join(p, view.id);
    t.tick();
    expect(t.view(view.id)!.status).toBe("open"); // not full and not yet time: waits
    vi.setSystemTime(Date.now() + HOUR);
    t.tick();
    const running = t.view(view.id)!;
    expect(running.status).toBe("running");
    expect(running.size).toBe(8);
    // seeds 1–3 have byes, seeds 4 and 5 play
    const first = running.rounds[0]!;
    expect(
      first
        .filter((m) => m.walkover)
        .map((m) => m.winner)
        .sort(),
    ).toEqual(players.slice(0, 3).sort());
    t.tick();
    expect(started.filter((s) => s.ref.round === 0).map((s) => [s.p0, s.p1].sort())).toEqual([
      [players[3], players[4]].sort(),
    ]);
    store.close();
  });

  it("is cancelled with too few players at the start time", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T18:00:00Z") });
    const store = new Store(":memory:");
    const players = Array.from({ length: 3 }, (_, i) => store.createPlayer(`P${i + 1}`).id);
    const { host } = stubHost();
    const t = new Tournaments(store, host, { startDelayMs: 0, guestMinMatches: 0 });
    const view = t.create(players[0]!, "Leer", "portes", 1, 8, "swiss", null, "relaxed", Date.now() + HOUR);
    for (const p of players.slice(1)) t.join(p, view.id);
    vi.setSystemTime(Date.now() + 2 * HOUR);
    t.tick();
    expect(t.view(view.id)!.status).toBe("cancelled");
    store.close();
  });
});

describe("scheduled leagues", () => {
  it("start by themselves at the scheduled time when there are enough players", () => {
    const store = new Store(":memory:");
    const clubs = new Clubs(store, { presence: () => ({ presence: "offline" }) });
    const [a, b, c, d] = Array.from({ length: 4 }, (_, i) => store.createPlayer(`P${i + 1}`).id) as [
      string,
      string,
      string,
      string,
    ];
    const club = clubs.create(a, "Termin-Club", "", true, true);
    for (const p of [b, c, d]) clubs.join(p, club.id);
    const at = Date.now() + 2 * HOUR;
    const league = clubs.createLeague(
      a,
      club.id,
      "Winter",
      "backgammon",
      3,
      4,
      "live",
      3,
      1,
      null,
      "relaxed",
      at,
    );
    expect(league.startsAt).toBe(at);
    const thin = clubs.createLeague(
      a,
      club.id,
      "Dünn",
      "backgammon",
      3,
      4,
      "live",
      3,
      1,
      null,
      "relaxed",
      at,
    );
    for (const p of [a, b, c, d]) clubs.joinLeague(p, league.id);
    clubs.joinLeague(a, thin.id);
    clubs.tick(at - 1);
    expect(clubs.leagueView(a, league.id).status).toBe("open");
    clubs.tick(at);
    const started = clubs.leagueView(a, league.id);
    expect(started.status).toBe("running");
    expect(started.matches).toHaveLength(6);
    expect(started.startsAt).toBeNull();
    // too few players: stays open without a date, an admin can start it later
    const waiting = clubs.leagueView(a, thin.id);
    expect(waiting.status).toBe("open");
    expect(waiting.startsAt).toBeNull();
    store.close();
  });
});
