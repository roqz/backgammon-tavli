import { describe, expect, it } from "vitest";
import { applyAction, createGame, getVariant, initialBoard, pipCount, turnOptions } from "../src";
import { absFromOwnPoint } from "../src/variants";
import { legal, mv, play, position } from "./helpers";

describe("tavla", () => {
  const T = "tavla";

  it("uses the backgammon setup, no cube, the opening winner rolls again", () => {
    const g = createGame({ variant: T });
    expect(g.cube.enabled).toBe(false);
    expect(pipCount(getVariant(T), g.board, 0)).toBe(167);
    const s = applyAction(g, { type: "roll", dice: [6, 2] });
    expect(s.phase).toBe("rolling");
    expect(s.turn).toBe(0);
  });

  it("a mars counts 2, never 3", () => {
    const s = position(T, { white: { 1: 1 }, black: { 13: 14 }, bar: [0, 1], off: [14, 0] }, 0, [1, 2]);
    expect(play(s, mv(T, 0, 1, "off", 2)).result).toMatchObject({ level: 2, points: 2 });
  });

  it("no hit-and-run in the home board: the hitting checker stays", () => {
    // White hits on its 4-point with 8/4 and may not run on with the 2 (4/2)
    const s = position(T, { white: { 8: 1, 13: 14 }, black: { 21: 1, 1: 14 } }, 0, [4, 2]);
    const hit = play(s, mv(T, 0, 8, 4, 4));
    expect(legal(hit)).not.toContain("4/2");
    expect(legal(hit)).toContain("13/11");
    // outside the home board running on is fine (Portes rules)
    const s2 = position(T, { white: { 13: 15 }, black: { 12: 1, 1: 14 } }, 0, [1, 3]);
    expect(legal(play(s2, mv(T, 0, 13, 12, 1)))).toContain("12/9");
  });

  it("no wasting pips: a die that can bear off must bear off", () => {
    const s = position(T, { white: { 5: 1, 2: 14 }, black: { 24: 15 } }, 0, [2, 1]);
    // with the 2 a checker must come off the 2-point instead of playing 5/3
    expect(legal(s)).not.toContain("5/3");
    expect(legal(s)).toContain("2/off");
  });
});

describe("narde", () => {
  const N = "narde";
  const rules = getVariant(N);
  const head = absFromOwnPoint(rules, 0, 24);
  /** Checkers that leave the head in each possible way to play the roll. */
  const fromHead = (s: ReturnType<typeof position>) =>
    turnOptions(s).map((o) => s.board.points[0][head]! - o.board.points[0][head]!);

  it("all checkers start on the head, diagonally opposite", () => {
    const b = initialBoard(rules);
    expect(b.points[0][absFromOwnPoint(rules, 0, 24)]).toBe(15);
    expect(b.points[1][absFromOwnPoint(rules, 0, 12)]).toBe(15);
    expect(createGame({ variant: N }).cube.enabled).toBe(false);
  });

  it("only one checker leaves the head per turn", () => {
    const s = position(N, { white: { 24: 14, 20: 1 }, black: { 24: 15 } }, 0, [5, 3]);
    expect(Math.max(...fromHead(s))).toBe(1);
    const after = play(s, mv(N, 0, 24, 19, 5));
    expect(legal(after).some((m) => m.startsWith("24/"))).toBe(false);
  });

  it("first roll 6-6, 4-4 or 3-3: two checkers may leave the head", () => {
    for (const d of [6, 4, 3]) {
      const s = position(N, { white: { 24: 15 }, black: { 24: 15 } }, 0, [d, d]);
      expect(Math.max(...fromHead(s))).toBe(2);
    }
    // other doubles: one only
    const s5 = position(N, { white: { 24: 15 }, black: { 24: 15 } }, 0, [5, 5]);
    expect(Math.max(...fromHead(s5))).toBe(1);
    // 6-6 later in the game: one only
    const later = position(N, { white: { 24: 14, 10: 1 }, black: { 24: 15 } }, 0, [6, 6]);
    expect(Math.max(...fromHead(later))).toBe(1);
  });

  it("a single checker blocks a point; a mars counts 2", () => {
    const s = position(N, { white: { 24: 13, 15: 1, 20: 1 }, black: { 24: 15 } }, 0, [3, 1]);
    expect(legal(s)).not.toContain("15/12");
    const end = position(N, { white: { 1: 1 }, black: { 24: 15 }, off: [14, 0] }, 0, [1, 2]);
    expect(play(end, mv(N, 0, 1, "off", 1)).result).toMatchObject({ level: 2, points: 2 });
  });
});

describe("hypergammon", () => {
  it("three checkers each on 24, 23, 22, with cube; the opening dice are played", () => {
    const rules = getVariant("hypergammon");
    const b = initialBoard(rules);
    for (const own of [24, 23, 22]) expect(b.points[0][absFromOwnPoint(rules, 0, own)]).toBe(1);
    expect(pipCount(rules, b, 0)).toBe(69);
    const g = applyAction(createGame({ variant: "hypergammon" }), { type: "roll", dice: [6, 2] });
    expect(g.cube.enabled).toBe(true);
    expect(g.phase).toBe("moving");
  });

  it("a backgammon counts 3", () => {
    const s = position(
      "hypergammon",
      { white: { 1: 1 }, black: { 24: 1, 23: 1, 3: 1 }, off: [2, 0] },
      0,
      [1, 2],
    );
    expect(play(s, mv("hypergammon", 0, 1, "off", 2)).result).toMatchObject({ level: 3 });
  });
});
