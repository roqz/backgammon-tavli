import { EMPTY_CAREER } from "@tavli/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { ACHIEVEMENTS, type AchievementContext } from "./achievements";
import {
  plaqueIds,
  SHOP,
  seasonIds,
  taskProgress,
  tasksFor,
  tokens,
  useCareer,
  weekId,
  weekRange,
  winterSeason,
} from "./career";
import type { GameRecord } from "./store/archive";

const game = (over: Partial<GameRecord> & { date: string }): GameRecord => ({
  id: over.date,
  variant: "backgammon",
  players: [
    { name: "Me", kind: "human" },
    { name: "Bot", kind: "bot", level: "hard" },
  ],
  matchLength: 3,
  result: { winner: 0, level: 1, cube: 1, points: 1, reason: "bear-off" },
  history: [],
  ...over,
});

describe("career", () => {
  beforeEach(() => useCareer.setState({ ...EMPTY_CAREER, seen: "" }));

  it("counts each archived game once; two players on one device do not count", () => {
    const records = [
      game({ date: "2026-11-10T10:00:00Z", variant: "plakoto" }),
      game({
        date: "2026-11-10T11:00:00Z",
        result: { winner: 1, level: 1, cube: 1, points: 1, reason: "bear-off" },
      }),
      game({
        date: "2026-11-10T12:00:00Z",
        players: [
          { name: "A", kind: "human" },
          { name: "B", kind: "human" },
        ],
      }),
    ];
    useCareer.getState().count(records);
    useCareer.getState().count(records);
    expect(useCareer.getState()).toMatchObject({ games: 2, wins: 1, winsBy: { plakoto: 1 } });
    useCareer.getState().count([game({ date: "2026-11-11T09:00:00Z", variant: "plakoto" }), ...records]);
    expect(useCareer.getState().winsBy.plakoto).toBe(2);
  });

  it("finds ISO weeks and their Monday", () => {
    expect(weekId(new Date(2026, 10, 15))).toBe("2026-W46"); // Sunday
    expect(weekId(new Date(2026, 10, 16))).toBe("2026-W47"); // Monday
    expect(weekId(new Date(2027, 0, 1))).toBe("2026-W53");
    const [start, end] = weekRange(new Date(2026, 10, 15));
    expect(start.getDay()).toBe(1);
    expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 3_600_000);
  });

  it("picks three different weekly tasks, the same on every device", () => {
    for (const w of ["2026-W46", "2026-W47", "2027-W01"]) {
      const tasks = tasksFor(w);
      expect(tasks).toHaveLength(3);
      expect(new Set(tasks.map((t) => t.kind)).size).toBe(3);
      expect(tasksFor(w)).toEqual(tasks);
    }
  });

  it("measures weekly tasks with the games of that week only", () => {
    const range = weekRange(new Date(2026, 10, 18));
    const inWeek = new Date(2026, 10, 18, 12).toISOString();
    const before = new Date(2026, 10, 10, 12).toISOString();
    const records = [
      game({ date: inWeek }),
      game({ date: before }),
      game({ date: inWeek, variant: "fevga" }),
    ];
    expect(taskProgress({ kind: "win", target: 3 }, records, {}, range)).toEqual([2, 3]);
    expect(taskProgress({ kind: "win-variant", target: 1, variant: "fevga" }, records, {}, range)).toEqual([
      1, 1,
    ]);
    expect(taskProgress({ kind: "beat-strong", target: 1 }, records, {}, range)).toEqual([1, 1]);
    expect(taskProgress({ kind: "online", target: 2 }, records, {}, range)).toEqual([0, 2]);
    expect(
      taskProgress(
        { kind: "puzzles", target: 3 },
        [],
        { "2026-11-17": { solved: true }, "2026-11-09": { solved: true } },
        range,
      ),
    ).toEqual([1, 3]);
  });

  it("earns tokens per task (two more for all three) and spends them in the exchange", () => {
    useCareer.getState().markTasks("2026-W46", [0, 1, 2]);
    useCareer.getState().markTasks("2026-W47", [1]);
    expect(tokens(useCareer.getState())).toBe(6);
    const set = SHOP.find((o) => o.id === "set-pearl")!;
    expect(useCareer.getState().take(set.id)).toBe(true);
    expect(tokens(useCareer.getState())).toBe(6 - set.price);
    expect(useCareer.getState().take(set.id)).toBe(false); // already taken
    expect(useCareer.getState().take("style-night")).toBe(false); // not enough tokens
  });

  it("awards plaques per variant and the inlay board for all in gold", () => {
    expect(plaqueIds({ ...EMPTY_CAREER, winsBy: { narde: 25 } })).toEqual([
      "master-narde-1",
      "master-narde-2",
    ]);
    const all = Object.fromEntries(
      ["backgammon", "portes", "plakoto", "fevga", "tavla", "narde", "hypergammon"].map((v) => [v, 100]),
    );
    expect(plaqueIds({ ...EMPTY_CAREER, winsBy: all })).toContain("master-all");
  });

  it("knows the winter season and unlocks it after ten games in it", () => {
    expect(winterSeason(new Date(2026, 5, 1))).toBeNull();
    expect(winterSeason(new Date(2027, 1, 10))?.id).toBe("season-winter-2026");
    const d = new Date(2026, 11, 20);
    const games = Array.from({ length: 10 }, (_, i) =>
      game({ date: new Date(2026, 11, 1 + i, 12).toISOString() }),
    );
    expect(seasonIds(games.slice(0, 9), d)).toEqual([]);
    expect(seasonIds(games, d)).toEqual(["season-winter-2026"]);
  });
});

describe("special moments", () => {
  const ctx = (records: GameRecord[]): AchievementContext => ({
    records,
    puzzles: {},
    lessonsSolved: 0,
    lessonsTotal: 11,
    profile: null,
    tournaments: [],
    me: null,
    career: EMPTY_CAREER,
  });
  const done = (id: string, records: GameRecord[]) => {
    const [n, target] = ACHIEVEMENTS.find((a) => a.id === id)!.progress(ctx(records));
    return n >= target;
  };

  it("comeback: a match won after being four points behind", () => {
    const won = game({ date: "2026-11-10T10:00:00Z", matchEnd: { winner: 0, maxDeficit: [4, 0] } });
    expect(done("comeback", [won])).toBe(true);
    expect(done("comeback", [game({ date: "x", matchEnd: { winner: 0, maxDeficit: [3, 2] } })])).toBe(false);
  });

  it("raining sixes, the pinned mother and a high cube", () => {
    const six = { kind: "move" as const, player: 0 as const, dice: [6, 6] as [number, number], moves: [] };
    expect(done("double-sixes", [game({ date: "a", history: [six, six, six] })])).toBe(true);
    expect(done("double-sixes", [game({ date: "a", history: [six, six] })])).toBe(false);
    expect(
      done("mana", [
        game({
          date: "a",
          variant: "plakoto",
          result: { winner: 0, level: 2, cube: 1, points: 2, reason: "mana" },
        }),
      ]),
    ).toBe(true);
    expect(
      done("cube-eight", [
        game({ date: "a", result: { winner: 0, level: 1, cube: 8, points: 8, reason: "drop" } }),
      ]),
    ).toBe(true);
  });
});
