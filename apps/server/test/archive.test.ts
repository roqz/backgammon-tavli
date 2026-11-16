import { ARCHIVE_MAX, type ArchivedGame, ArchivedGameSchema, type Looks } from "@tavli/protocol";
import { describe, expect, it } from "vitest";
import { Store } from "../src/db";

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
const game = (id: string, date: string): ArchivedGame => ({
  id,
  date,
  variant: "portes",
  players: [
    { name: "Ann", kind: "human" },
    { name: "Computer", kind: "bot", level: "hard" },
  ],
  matchLength: 3,
  result: { winner: 0, level: 1, cube: 1, points: 1, reason: "borne-off" },
  history: [{ player: 0, dice: [3, 1], moves: [] }],
});
const ref = (g: ArchivedGame) => ({ id: g.id, date: g.date });

describe("game archive across devices", () => {
  it("each device gets the other's games and uploads its own", () => {
    const store = new Store(":memory:");
    const id = store.createPlayer("Ann").id;
    const phone = [game("phone1", day(1)), game("phone2", day(3))];
    const desk = [game("desk1", day(2))];

    // the phone comes first: the server has nothing yet
    let r = store.syncArchive(id, phone.map(ref));
    expect(r.missing).toEqual(["phone1", "phone2"]);
    expect(r.games).toEqual([]);
    store.addArchive(id, phone);

    // the desktop gets both phone games (with their moves) and uploads its own
    r = store.syncArchive(id, desk.map(ref));
    expect(r.missing).toEqual(["desk1"]);
    expect(r.games.map((g) => g.id).sort()).toEqual(["phone1", "phone2"]);
    expect(r.games[0]!.history).toHaveLength(1);
    store.addArchive(id, desk);

    // nothing left to exchange
    r = store.syncArchive(id, [...phone, ...desk].map(ref));
    expect(r).toEqual({ missing: [], games: [] });
  });

  it("keeps the newest games on both sides alike, so old ones do not travel back and forth", () => {
    const store = new Store(":memory:");
    const id = store.createPlayer("Ann").id;
    const server = Array.from({ length: ARCHIVE_MAX }, (_, i) => game(`s${i}`, day(100 + i)));
    store.addArchive(id, server);
    // a device with older games only: none of them makes the cut
    const old = [game("old1", day(1)), game("old2", day(2))];
    const r = store.syncArchive(id, old.map(ref));
    expect(r.missing).toEqual([]);
    expect(r.games).toHaveLength(ARCHIVE_MAX);
    // one newer game pushes the oldest stored one out
    store.addArchive(id, [game("new", day(9999))]);
    const n = store.db.prepare("SELECT COUNT(*) AS n FROM player_games WHERE player_id = ?").get(id) as {
      n: number;
    };
    expect(n.n).toBe(ARCHIVE_MAX);
    expect(store.syncArchive(id, []).games.some((g) => g.id === "s0")).toBe(false);
  });

  it("clearing, export and deleting the profile cover the archive", () => {
    const store = new Store(":memory:");
    const id = store.createPlayer("Ann").id;
    store.addArchive(id, [game("g1", day(1))]);
    expect((store.exportData(id)!.gameArchive as unknown[]).length).toBe(1);
    store.clearArchive(id);
    expect(store.syncArchive(id, []).games).toEqual([]);
    store.addArchive(id, [game("g2", day(2))]);
    store.deletePlayer(id);
    const n = store.db.prepare("SELECT COUNT(*) AS n FROM player_games").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it("rejects records that are not games", () => {
    expect(ArchivedGameSchema.safeParse(game("ok-1", day(1))).success).toBe(true);
    expect(ArchivedGameSchema.safeParse({ ...game("x", day(1)) }).success).toBe(false);
    expect(ArchivedGameSchema.safeParse({ ...game("bad", "yesterday") }).success).toBe(false);
  });
});

describe("looks across devices", () => {
  const looks = (at: string, style: string): Looks => ({
    at,
    style,
    diceSkin: "theme",
    checkerSet: "theme",
    soundSet: "classic",
    diceSurface: "classic",
    lang: "de",
  });
  it("the looks chosen last on any device win", () => {
    const store = new Store(":memory:");
    const id = store.createPlayer("Ann").id;
    const base = { unlocked: {}, lessons: [], puzzles: {} };
    store.mergeProgress(id, { ...base, looks: looks("2026-11-10T10:00:00.000Z", "modern") });
    // an older choice from another device does not override it
    expect(
      store.mergeProgress(id, { ...base, looks: looks("2026-11-09T10:00:00.000Z", "night") }).looks?.style,
    ).toBe("modern");
    // a device without looks keeps them
    expect(store.mergeProgress(id, base).looks?.style).toBe("modern");
    expect(
      store.mergeProgress(id, { ...base, looks: looks("2026-11-11T10:00:00.000Z", "night") }).looks?.style,
    ).toBe("night");
  });
});
