import { describe, expect, it } from "vitest";
import { applyAction, formatHistory, getVariant, initialBoard, pipCount } from "../src";
import { legal, mv, play, position } from "./helpers";

const BG = "backgammon";
/** Black holds white's points 4..12 (black own 13..21) like in the legacy test positions. */
const BLACK_WALL = { 12: 1, 11: 2, 9: 2, 8: 2, 7: 2, 6: 2, 5: 2, 4: 2 };

describe("backgammon – cases ported from the legacy Angular specs", () => {
  it("plays the higher die if only one die can be used", () => {
    const s = position(BG, { white: { 1: 14, 24: 1 }, black: BLACK_WALL }, 0, [1, 2]);
    expect(legal(s)).toEqual(["24/22"]);
  });

  it("forces the order that allows both dice to be played", () => {
    const s = position(
      BG,
      {
        white: { 2: 1, 4: 2, 6: 1 },
        black: { 24: 2, 12: 1, 9: 2, 8: 2, 7: 2, 6: 2, 5: 2, 4: 2 },
        off: [11, 0],
      },
      0,
      [6, 3],
    );
    expect(legal(s)).toEqual(["6/3"]);
  });

  const blocked = {
    white: { 1: 2, 2: 5, 3: 4, 4: 2, 24: 2 },
    black: { 10: 1, 8: 3, 7: 4, 6: 2, 4: 3, 2: 2 },
  };

  it("finds no move when everything is blocked", () => {
    expect(legal(position(BG, blocked, 0, [5, 6]))).toEqual([]);
  });

  it("finds the single possible move", () => {
    expect(legal(position(BG, blocked, 0, [4, 6]))).toEqual(["24/20"]);
  });

  it("handles doubles", () => {
    expect(legal(position(BG, { white: { 24: 2 }, black: { 2: 2 } }, 0, [2, 2]))).toEqual(["24/22"]);
  });

  it("initial pip count is 167", () => {
    const rules = getVariant(BG);
    expect(pipCount(rules, initialBoard(rules), 0)).toBe(167);
    expect(pipCount(rules, initialBoard(rules), 1)).toBe(167);
  });
});

describe("backgammon – move rules", () => {
  it("opening 31 offers the standard moves", () => {
    const s = position(
      BG,
      { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      0,
      [3, 1],
    );
    expect(legal(s)).toEqual(["13/10", "24/21", "24/23", "6/3", "6/5", "8/5", "8/7"]);
  });

  it("must enter from the bar first", () => {
    const s = position(BG, { white: { 13: 14 }, black: { 6: 2 }, bar: [1, 0] }, 0, [6, 1]);
    expect(legal(s)).toEqual(["bar/24"]);
    const after = play(s, mv(BG, 0, "bar", 24, 1));
    expect(legal(after)).toContain("13/7");
  });

  it("cannot move at all when the entry points are closed", () => {
    const s = position(
      BG,
      { white: { 13: 14 }, black: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, bar: [1, 0] },
      0,
      [3, 4],
    );
    expect(legal(s)).toEqual([]);
  });

  it("hits a blot and sends it to the bar", () => {
    // black blot on black's own 12 = white's own 13
    const s = position(BG, { white: { 16: 1 }, black: { 12: 1, 1: 14 } }, 0, [3, 1]);
    const after = play(s, mv(BG, 0, 16, 13, 3));
    expect(after.board.bar[1]).toBe(1);
    expect(after.played[0]!.hit).toBe(true);
  });

  it("cannot land on a point with two opposing checkers", () => {
    const s = position(BG, { white: { 16: 1, 1: 14 }, black: { 12: 2, 1: 13 } }, 0, [3, 3]);
    expect(legal(s)).not.toContain("16/13");
  });

  it("bears off with a higher die only from the rearmost point", () => {
    const s = position(BG, { white: { 3: 1, 2: 1 }, black: { 24: 15 }, off: [13, 0] }, 0, [6, 5]);
    expect(legal(s)).toEqual(["3/off"]);
  });

  it("may not bear off while a checker is outside the home board", () => {
    const s = position(BG, { white: { 7: 1, 1: 14 }, black: { 13: 15 } }, 0, [1, 6]);
    expect(legal(s)).toEqual(["7/1", "7/6"]);
  });

  it("bearing off the last checker counts as using all dice (no forced detour)", () => {
    const s = position(BG, { white: { 2: 1 }, black: { 13: 15 }, off: [14, 0] }, 0, [2, 1]);
    expect(legal(s)).toEqual(["2/1", "2/off"]);
  });

  it("notates hits and repeated moves", () => {
    let s = position(BG, { white: { 8: 2, 1: 13 }, black: { 21: 1, 1: 14 } }, 0, [4, 4]);
    s = play(s, mv(BG, 0, 8, 4, 4), mv(BG, 0, 8, 4, 4), mv(BG, 0, 4, "off", 4), mv(BG, 0, 4, "off", 4));
    s = applyAction(s, { type: "confirm" });
    expect(formatHistory(s)).toEqual(["White: 44: 8/4* 8/4 4/off(2)"]);
  });

  it("plays as many dice of a double as possible", () => {
    // White can move 24 -> 20 -> 16, but 12 is blocked (black own 13 = white own 12).
    const s = position(BG, { white: { 24: 1, 1: 14 }, black: { 13: 2, 19: 13 } }, 0, [4, 4]);
    const after = play(s, mv(BG, 0, 24, 20, 4), mv(BG, 0, 20, 16, 4));
    expect(after.remaining).toEqual([4, 4]);
    expect(legal(after)).toEqual([]);
  });
});
