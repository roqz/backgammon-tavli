import { describe, expect, it } from "vitest";
import { Clubs, NO_SHOW_LIMIT, nextMonthStart, publicDivisions } from "../src/clubs";
import { Correspondence } from "../src/correspondence";
import { Store } from "../src/db";

const DAY = 24 * 60 * 60_000;

describe("public monthly league", () => {
  it("divisions of about seven, starts on the 1st", () => {
    expect([3, 6, 10, 11, 14, 20, 50].map(publicDivisions)).toEqual([1, 1, 1, 2, 2, 3, 7]);
    expect(new Date(nextMonthStart(Date.UTC(2026, 10, 13, 15))).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(new Date(nextMonthStart(Date.UTC(2026, 11, 31))).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("runs by itself: entries, start with divisions, next season with last season's players minus no-shows", () => {
    const store = new Store(":memory:");
    // clubs first: the correspondence host forwards results to it
    let clubs: Clubs | null = null;
    const corr = new Correspondence(store, {
      notify: () => {},
      isConnected: () => false,
      leagueResult: (league, players, winner, score) => clubs!.matchEnded(league, players, winner, score),
    });
    clubs = new Clubs(store, {
      presence: () => ({ presence: "offline" }),
      startCorrGame: (league, p0, p1, variant, length, days) =>
        corr.startLeagueGame(league, p0, p1, variant, length, days),
      endCorrGame: (id) => corr.endWithoutResult(id),
    });
    const now = Date.UTC(2026, 10, 13, 12);
    const players = Array.from({ length: 8 }, (_, i) => store.createPlayer(`P${i + 1}`).id);
    const first = clubs.publicLeague(players[0]!, now);
    expect(first.current).toBeNull();
    expect(first.next).toMatchObject({
      variant: "backgammon",
      length: 1,
      mode: "corr",
      days: 1,
      startsAt: Date.UTC(2026, 11, 1),
    });
    // the public club is not listed in the club search
    expect(clubs.list(players[0]!, "public")).toHaveLength(0);
    for (const p of players) clubs.joinLeague(p, first.next!.id);
    clubs.tick(Date.UTC(2026, 11, 1, 0, 1));
    const season = clubs.publicLeague(players[0]!, Date.UTC(2026, 11, 1, 0, 1));
    expect(season.current?.id).toBe(first.next!.id);
    expect(season.current?.status).toBe("running");
    expect(season.current?.myDivision).toBe(1);
    expect(clubs.leagueView(players[0]!, season.current!.id).matches).toHaveLength(28);
    // the next season is open already, with this season's players entered
    expect(season.next?.startsAt).toBe(Date.UTC(2027, 0, 1));
    expect(season.next?.players).toBe(8);
    // nobody moves for two days: every first decision is lost on time
    corr.tick(Date.now() + 2 * DAY);
    // only Ann and Ben count as no-shows: the other time losses become normal results
    const [ann, ben] = players as [string, string];
    store.db
      .prepare(
        `UPDATE corr_games SET reason = 'won' WHERE league_id = ? AND reason = 'abandoned'
         AND (CASE WHEN winner = 0 THEN p1 ELSE p0 END) NOT IN (?, ?)`,
      )
      .run(season.current!.id, ann, ben);
    const lostOnTime = store.db
      .prepare(
        `SELECT CASE WHEN winner = 0 THEN p1 ELSE p0 END AS loser, COUNT(*) AS n FROM corr_games
         WHERE league_id = ? AND reason = 'abandoned' GROUP BY loser`,
      )
      .all(season.current!.id) as { loser: string; n: number }[];
    const noShows = lostOnTime.filter((r) => r.n >= NO_SHOW_LIMIT).map((r) => r.loser);
    expect(noShows.length).toBeGreaterThan(0);
    expect(noShows.every((p) => p === ann || p === ben)).toBe(true);
    clubs.tick(Date.UTC(2027, 0, 1, 0, 1));
    const jan = clubs.publicLeague(players[0]!, Date.UTC(2027, 0, 1, 0, 1));
    const view = clubs.leagueView(players[0]!, jan.current!.id);
    const entered = view.entries.map((p) => p.id);
    for (const p of noShows) expect(entered).not.toContain(p);
    expect(entered.length).toBe(8 - noShows.length);
    store.close();
  });
});
