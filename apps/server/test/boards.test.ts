import { describe, expect, it } from "vitest";
import { BOARDS, Store, VETERAN } from "../src/db";
import { BACKUP_FILE } from "../src/server";

let n = 0;
/** A finished 1-point match between two players, ended at `at`. */
const play = (store: Store, winner: string, loser: string, at: string, rated = true) => {
  const id = `m${++n}`;
  store.saveMatch({
    id,
    variant: "backgammon",
    length: 1,
    players: [winner, loser],
    winner: 0,
    score: [1, 0],
    reason: "won",
    games: [],
    startedAt: at,
    rated,
  });
  store.db.prepare("UPDATE matches SET ended_at = ? WHERE id = ?").run(at, id);
};

const NOV = Date.parse("2026-11-20T12:00:00Z");
const DEC = Date.parse("2026-12-02T12:00:00Z");

describe("monthly ranking", () => {
  it("ranks the rating gained this month, from the minimum of rated matches on", () => {
    const store = new Store(":memory:");
    const [a, b, c] = ["Ann", "Ben", "Cem"].map((name) => store.createPlayer(name).id) as [
      string,
      string,
      string,
    ];
    for (let i = 0; i < BOARDS.monthMinMatches; i++)
      play(store, a, b, `2026-11-${10 + (i % 9)}T10:00:00.000Z`);
    play(store, c, a, "2026-11-19T10:00:00.000Z");
    // last month and unrated matches do not count
    play(store, b, a, "2026-10-30T10:00:00.000Z");
    play(store, b, a, "2026-11-19T11:00:00.000Z", false);
    const board = store.monthBoard("backgammon", "normal", NOV);
    expect(board.month).toBe("2026-11");
    // Cem has a single match: below the minimum
    expect(board.entries.map((e) => e.name)).toEqual(["Ann", "Ben"]);
    expect(board.entries[0]!.gain).toBeGreaterThan(0);
    expect(board.entries[1]!.gain).toBeLessThan(0);
    expect(board.entries[0]!.matches).toBe(BOARDS.monthMinMatches + 1);
    // a player who leaves the rankings disappears
    store.setListed(a, false);
    expect(store.monthBoard("backgammon", "normal", NOV).entries.map((e) => e.name)).toEqual(["Ben"]);
  });

  it("archives the podium of a finished month once; first place unlocks the champion frame", () => {
    const store = new Store(":memory:");
    const [a, b] = ["Ann", "Ben"].map((name) => store.createPlayer(name).id) as [string, string];
    for (let i = 0; i < BOARDS.monthMinMatches; i++)
      play(store, a, b, `2026-11-${10 + (i % 9)}T10:00:00.000Z`);
    expect(store.setFrame(a, "champion")).toBe(false);
    expect(store.archiveMonths(NOV)).toEqual([]);
    expect(store.archiveMonths(DEC)).toEqual(["2026-11"]);
    expect(store.archiveMonths(DEC)).toEqual([]);
    const board = store.monthBoard("backgammon", "normal", DEC);
    expect(board.entries).toEqual([]);
    expect(board.previous.map((e) => e.name)).toEqual(["Ann", "Ben"]);
    expect(store.trophies(a)).toEqual([{ month: "2026-11", variant: "backgammon", place: 1 }]);
    expect(store.profile(a)?.trophies).toHaveLength(1);
    expect(store.verifiedAchievements(a)).toContain("month-winner");
    expect(store.setFrame(a, "champion")).toBe(true);
    expect(store.setFrame(b, "champion")).toBe(false);
  });
});

describe("activity ranking", () => {
  it("counts finished matches of the last days, at most a few per opponent and day", () => {
    const store = new Store(":memory:");
    const [a, b, c] = ["Ann", "Ben", "Cem"].map((name) => store.createPlayer(name).id) as [
      string,
      string,
      string,
    ];
    // ten matches against Ben on one day: only three count
    for (let i = 0; i < 10; i++) play(store, a, b, "2026-11-19T10:00:00.000Z", false);
    play(store, a, c, "2026-11-18T10:00:00.000Z");
    play(store, c, a, "2026-11-17T10:00:00.000Z");
    // too long ago
    play(store, b, c, "2026-09-01T10:00:00.000Z");
    const board = store.activeBoard(NOV);
    // Ben counts three, Cem two (below the minimum)
    expect(board.entries.map((e) => [e.name, e.matches])).toEqual([
      ["Ann", BOARDS.perOpponentDay + 2],
      ["Ben", BOARDS.perOpponentDay],
    ]);
    expect(board.days).toBe(BOARDS.activeDays);
  });
});

describe("public profile", () => {
  it("shows the chosen achievements only once they are unlocked", () => {
    const store = new Store(":memory:");
    const [a, b] = ["Ann", "Ben"].map((name) => store.createPlayer(name).id) as [string, string];
    expect(store.setShowcase(a, ["online-win"])).toBe(false);
    play(store, a, b, "2026-11-19T10:00:00.000Z");
    expect(store.setShowcase(a, ["online-win", "online-win"])).toBe(true);
    expect(store.profile(a)?.showcase).toEqual(["online-win"]);
    expect(store.account(a)?.showcase).toEqual(["online-win"]);
    expect(store.profile(a)?.since).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("backups", () => {
  it("recognises the daily backup files for the rotation", () => {
    expect(BACKUP_FILE.test("tavli-2026-11-16.db")).toBe(true);
    expect(BACKUP_FILE.test("tavli-2026-11-16.db-wal")).toBe(false);
    expect(BACKUP_FILE.test("other.db")).toBe(false);
  });
});

describe("titles and the new frames", () => {
  it("offers earned titles only, including first places of monthly rankings", () => {
    const store = new Store(":memory:");
    const [a, b] = ["Ann", "Ben"].map((name) => store.createPlayer(name).id) as [string, string];
    expect(store.account(a)?.titles).toEqual([]);
    expect(store.setTitle(a, "rating-1600")).toBe(false);
    store.setRating(a, "backgammon", 1650);
    store.db.prepare("UPDATE ratings SET matches = 1 WHERE player_id = ?").run(a);
    expect(store.account(a)?.titles).toContain("rating-1600");
    expect(store.setTitle(a, "rating-1600")).toBe(true);
    expect(store.publicPlayer(a, "backgammon").title).toBe("rating-1600");
    for (let i = 0; i < BOARDS.monthMinMatches; i++) play(store, a, b, `2026-11-${10 + (i % 9)}T10:00:00.000Z`);
    store.archiveMonths(DEC);
    expect(store.account(a)?.titles).toContain("month-winner:2026-11:backgammon");
    expect(store.setTitle(a, "month-winner:2026-11:backgammon")).toBe(true);
    expect(store.profile(a)?.title).toBe("month-winner:2026-11:backgammon");
    expect(store.setTitle(b, "month-winner:2026-11:backgammon")).toBe(false);
    expect(store.setTitle(a, null)).toBe(true);
    expect(store.publicPlayer(a, "backgammon").title).toBeNull();
  });

  it("checks the variant master and veteran frames against the server's records", () => {
    const store = new Store(":memory:");
    const [a, b] = ["Ann", "Ben"].map((name) => store.createPlayer(name).id) as [string, string];
    for (const v of ["portes", "plakoto"] as const) store.setRating(a, v, 1620);
    store.db.prepare("UPDATE ratings SET matches = 3 WHERE player_id = ?").run(a);
    expect(store.setFrame(a, "master")).toBe(false);
    store.setRating(a, "fevga", 1601);
    store.db.prepare("UPDATE ratings SET matches = 3 WHERE player_id = ?").run(a);
    expect(store.setFrame(a, "master")).toBe(true);

    expect(store.setFrame(b, "veteran")).toBe(false);
    for (let i = 0; i < VETERAN.matches; i++) play(store, b, a, "2026-11-01T10:00:00.000Z", false);
    expect(store.setFrame(b, "veteran")).toBe(false);
    store.db.prepare("UPDATE players SET created_at = ? WHERE id = ?").run("2024-01-01T00:00:00.000Z", b);
    expect(store.setFrame(b, "veteran")).toBe(true);
  });
});
