import { describe, expect, it } from "vitest";
import { type AchievementContext, reached } from "./achievements";
import type { GameRecord } from "./store/archive";

const game = (
  variant: GameRecord["variant"],
  winner: 0 | 1,
  level: 1 | 2 | 3 = 1,
  bot: "easy" | "hard" = "easy",
): GameRecord => ({
  id: Math.random().toString(36),
  date: new Date().toISOString(),
  variant,
  players: [
    { name: "Me", kind: "human" },
    { name: "Bot", kind: "bot", level: bot },
  ],
  matchLength: 1,
  result: { winner, level, cube: 1, points: level, reason: "bear-off" },
  history: [],
});

const base: AchievementContext = {
  records: [],
  puzzles: {},
  lessonsSolved: 0,
  lessonsTotal: 6,
  profile: null,
  tournaments: [],
  me: null,
};

describe("achievements", () => {
  it("nothing at the start", () => {
    expect(reached(base)).toEqual([]);
  });

  it("wins, gammons, the strong bot and all variants", () => {
    const records = [
      game("backgammon", 0, 3, "hard"),
      game("portes", 0, 2),
      game("plakoto", 0),
      game("fevga", 0),
      game("fevga", 1), // a loss does not count
    ];
    const ids = reached({ ...base, records });
    expect(ids).toEqual(
      expect.arrayContaining(["first-win", "beat-hard", "gammon", "backgammon", "all-variants"]),
    );
    expect(ids).not.toContain("ten-wins");
  });

  it("tutorial and puzzle streaks", () => {
    const day = (d: number) => {
      const x = new Date();
      x.setDate(x.getDate() - d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    const puzzles = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [day(i), { solved: true, loss: 0 }]),
    );
    const ids = reached({ ...base, puzzles, lessonsSolved: 6 });
    expect(ids).toEqual(expect.arrayContaining(["tutorial", "puzzle", "puzzle-week"]));
    expect(ids).not.toContain("puzzle-month");
  });
});
