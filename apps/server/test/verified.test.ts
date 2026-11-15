import type { GameResult } from "@tavli/engine";
import { EMPTY_CAREER } from "@tavli/protocol";
import { describe, expect, it } from "vitest";
import { Store } from "../src/db";

const result = (winner: 0 | 1): GameResult => ({ winner, level: 1, cube: 1, points: 1, reason: "bear-off" });

describe("progress the server counts itself", () => {
  it("online games and wins per variant are a floor for the career, whatever a device reports", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    const b = store.createPlayer("Ben").id;
    // a Tavli match: Ann wins Portes and Fevga, Ben wins Plakoto; the last game was cut short
    store.saveMatch({
      id: "m1",
      variant: "tavli",
      length: 3,
      players: [a, b],
      winner: 0,
      score: [2, 1],
      reason: "won",
      games: [
        { variant: "portes", history: [], result: result(0) },
        { variant: "plakoto", history: [], result: result(1) },
        { variant: "fevga", history: [], result: result(0) },
        { variant: "portes", history: [], result: null },
      ],
      startedAt: new Date().toISOString(),
      rated: true,
    });
    // Ben sits on seat 0 here and loses
    store.saveMatch({
      id: "m2",
      variant: "backgammon",
      length: 1,
      players: [b, a],
      winner: 1,
      score: [0, 1],
      reason: "won",
      games: [{ variant: "backgammon", history: [], result: result(1) }],
      startedAt: new Date().toISOString(),
      rated: true,
    });
    expect(store.verifiedCareer(a)).toMatchObject({
      games: 4,
      wins: 3,
      winsBy: { portes: 1, fevga: 1, backgammon: 1 },
    });
    expect(store.verifiedCareer(b)).toMatchObject({ games: 4, wins: 1, winsBy: { plakoto: 1 } });

    // a device that knows less cannot lower it; one that knows more (games vs the computer) raises it
    const merged = store.mergeProgress(a, {
      unlocked: {},
      lessons: [],
      puzzles: {},
      career: { ...EMPTY_CAREER, games: 1, wins: 0 },
    });
    expect(merged.career).toMatchObject({ games: 4, wins: 3 });
    expect(merged.unlocked["online-win"]).toBeTruthy();
    const more = store.mergeProgress(a, {
      unlocked: {},
      lessons: [],
      puzzles: {},
      career: { ...EMPTY_CAREER, games: 40, wins: 20, winsBy: { portes: 9 } },
    });
    expect(more.career).toMatchObject({ games: 40, wins: 20, winsBy: { portes: 9, fevga: 1 } });
  });

  it("frames for online feats need the server's records, a claimed achievement is not enough", () => {
    const store = new Store(":memory:");
    const a = store.createPlayer("Ann").id;
    store.mergeProgress(a, {
      unlocked: { "tournament-win": "2026-01-01", tutorial: "2026-01-01" },
      lessons: [],
      puzzles: {},
    });
    expect(store.setFrame(a, "gold")).toBe(false); // tournament win: not in the server's records
    expect(store.setFrame(a, "scholar")).toBe(true); // tutorial: offline, taken as reported
    expect(store.setFrame(a, "laurel")).toBe(false);
    store.setRating(a, "backgammon", 1612);
    // a rating counts once matches were played in it
    expect(store.setFrame(a, "laurel")).toBe(false);
  });
});
