import { describe, expect, it } from "vitest";
import {
  applyAction,
  boardFromSpec,
  createGame,
  formatMove,
  getVariant,
  initialBoard,
  isDraw,
  MoveGenerator,
  pipCount,
  singleMoves,
  violatesFevgaPrime,
} from "../src";
import { absFromOwnPoint } from "../src/variants";
import { legal, mv, play, position } from "./helpers";

describe("portes", () => {
  it("uses the backgammon setup without cube", () => {
    const g = createGame({ variant: "portes" });
    expect(g.cube.enabled).toBe(false);
    expect(pipCount(getVariant("portes"), g.board, 0)).toBe(167);
  });

  it("winner of the opening roll rolls again", () => {
    const g = applyAction(createGame({ variant: "portes" }), { type: "roll", dice: [2, 5] });
    expect(g.phase).toBe("rolling");
    expect(g.turn).toBe(1);
  });

  it("scores a mars (gammon) as 2 points, never 3", () => {
    // White bears off the last checker while black still sits on the bar.
    const s = position(
      "portes",
      { white: { 1: 1 }, black: { 13: 14 }, bar: [0, 1], off: [14, 0] },
      0,
      [1, 2],
    );
    const done = play(s, mv("portes", 0, 1, "off", 2));
    expect(done.result).toMatchObject({ winner: 0, level: 2, points: 2 });
  });
});

describe("plakoto", () => {
  const P = "plakoto";

  it("starts with all checkers on the starting point (pip count 360)", () => {
    const rules = getVariant(P);
    const b = initialBoard(rules);
    expect(pipCount(rules, b, 0)).toBe(360);
    expect(b.points[0][absFromOwnPoint(rules, 0, 24)]).toBe(15);
  });

  it("pins a blot instead of hitting it", () => {
    // Black blot on black's own 4 = white's own 21.
    const s = position(P, { white: { 24: 15 }, black: { 24: 14, 4: 1 } }, 0, [3, 1]);
    const after = play(s, mv(P, 0, 24, 21, 3));
    const abs = absFromOwnPoint(getVariant(P), 0, 21);
    expect(after.board.pinned[abs]).toBe(1);
    expect(after.board.bar[1]).toBe(0);
    expect(after.played[0]!.hit).toBe(true);
  });

  it("a pinned checker cannot move and its point is blocked for its owner", () => {
    const rules = getVariant(P);
    const b = boardFromSpec(rules, {
      white: { 21: 1, 24: 14 },
      black: { 24: 13, 4: 1, 6: 1 },
      pinnedBlack: [4],
    });
    const moves = singleMoves(rules, b, 1, 2);
    const pinnedAbs = absFromOwnPoint(rules, 1, 4);
    expect(moves.some((m) => m.from === pinnedAbs)).toBe(false);
    // black from own 6 with a 2 would land on own 4 – held by white on top
    expect(moves.some((m) => m.to === pinnedAbs)).toBe(false);
  });

  it("releases the pinned checker when the pinning checker leaves", () => {
    const rules = getVariant(P);
    const board = boardFromSpec(rules, {
      white: { 21: 1, 24: 14 },
      black: { 24: 14, 4: 1 },
      pinnedBlack: [4],
    });
    let s = applyAction(createGame({ variant: P, board, starter: 0 }), { type: "roll", dice: [5, 6] });
    s = play(s, mv(P, 0, 21, 16, 5));
    expect(s.board.pinned[absFromOwnPoint(rules, 0, 21)]).toBe(null);
  });

  it("pinning the opponent's last checker on its starting point wins a double game (mana)", () => {
    // Black's starting point is white's own 1. White runner on own 3 pins the lone black checker there.
    // (white has no checkers left on its own start, so the mother rule applies)
    const s = position(P, { white: { 10: 14, 3: 1 }, black: { 24: 1, 12: 14 } }, 0, [2, 1]);
    const done = play(s, mv(P, 0, 3, 1, 2));
    expect(done.result).toMatchObject({ winner: 0, level: 2, points: 2, reason: "mana" });
  });

  it("no mana while the pinning player still has checkers on its own start; it wins once they left", () => {
    // White still has 13 on its start: pinning black's mother does not end the game.
    const s = position(P, { white: { 24: 13, 3: 1, 10: 1 }, black: { 24: 1, 12: 14 } }, 0, [2, 1]);
    const pinned = play(s, mv(P, 0, 3, 1, 2));
    expect(pinned.result).toBeNull();
    expect(pinned.board.pinned[absFromOwnPoint(getVariant(P), 0, 1)]).toBe(1);

    // Later white's last checker leaves its start while black's mother is still pinned: mana.
    const late = position(
      P,
      { white: { 24: 1, 1: 1, 10: 13 }, black: { 24: 1, 12: 14 }, pinnedBlack: [24] },
      0,
      [6, 5],
    );
    const done = play(late, mv(P, 0, 24, 18, 6));
    expect(done.result).toMatchObject({ winner: 0, points: 2, reason: "mana" });
  });

  it("both mothers pinned is a draw without points", () => {
    // Black's mother is pinned by white (white still had start checkers); now black pins white's.
    const s = position(
      P,
      { white: { 24: 1, 1: 1, 10: 13 }, black: { 24: 1, 3: 1, 12: 13 }, pinnedBlack: [24] },
      1,
      [2, 1],
    );
    const done = play(s, mv(P, 1, 3, 1, 2));
    expect(done.result).toMatchObject({ reason: "mana-draw", points: 0 });
    expect(isDraw(done.result)).toBe(true);
  });
});

describe("fevga", () => {
  const F = "fevga";

  it("starts in diagonally opposite corners", () => {
    const rules = getVariant(F);
    const b = initialBoard(rules);
    // black's start = white's own 12
    expect(b.points[1][absFromOwnPoint(rules, 0, 12)]).toBe(15);
    expect(b.points[0][absFromOwnPoint(rules, 0, 24)]).toBe(15);
  });

  it("cannot land on any point occupied by the opponent", () => {
    // White runner on own 15 cannot land on own 12 (black's start) with a 3.
    const s = position(F, { white: { 24: 13, 15: 1, 20: 1 }, black: { 24: 15 } }, 0, [3, 3]);
    expect(legal(s)).not.toContain("15/12");
  });

  it("only the first checker may move until it has passed the opponent's start", () => {
    const s = position(F, { white: { 24: 14, 20: 1 }, black: { 24: 15 } }, 0, [3, 1]);
    expect(legal(s)).toEqual(["20/17", "20/19"]);
  });

  it("a blocked first checker means the roll is lost: no other checker moves instead", () => {
    // White runner on own 15; black holds own 12 and 13 (white's 13 and 12 ... both landing points).
    const s = position(F, { white: { 24: 14, 15: 1 }, black: { 24: 13, 1: 1, 2: 1 } }, 0, [3, 2]);
    expect(legal(s)).toEqual([]);
  });

  it("other checkers may leave the start once the runner has passed", () => {
    const s = position(F, { white: { 24: 14, 11: 1 }, black: { 24: 15 } }, 0, [3, 1]);
    expect(legal(s)).toContain("24/21");
  });

  it("forbids ending the turn with a six-point prime when no opposing checker is ahead of it", () => {
    const rules = getVariant(F);
    // White holds own 11,10,9,8,7 (two each); 24/21 with the 3 and 7/6 would leave a six-prime
    // own 11–6 in front of all black checkers.
    const spec = { white: { 24: 5, 11: 2, 10: 2, 9: 2, 8: 2, 7: 2 } };
    const b = boardFromSpec(rules, { ...spec, black: { 24: 15 } });
    expect(violatesFevgaPrime(rules, b, 0)).toBe(false);
    const s = position(F, { ...spec, black: { 24: 15 } }, 0, [3, 1]);
    // 7/6 alone is fine (8/7 or 24/21 follow); every way to end the turn avoids the prime
    for (const option of new MoveGenerator(rules, 0).turnOptions(s.board, [3, 1]))
      expect(violatesFevgaPrime(rules, option.board, 0)).toBe(false);

    // With one black checker already past the block the prime is allowed.
    const b2 = boardFromSpec(rules, {
      ...spec,
      white: { ...spec.white, 7: 1, 6: 1 },
      black: { 24: 14, 10: 1 },
    });
    expect(violatesFevgaPrime(rules, b2, 0)).toBe(false);
    const b3 = boardFromSpec(rules, { ...spec, white: { ...spec.white, 7: 1, 6: 1 }, black: { 24: 15 } });
    expect(violatesFevgaPrime(rules, b3, 0)).toBe(true);
  });

  it("a prime may be passed through during the turn as long as it is open at the end", () => {
    const rules = getVariant(F);
    // 9/6 closes own 11–6 for a moment; 6/5 with the 1 opens it again – allowed.
    const spec = { white: { 24: 5, 11: 2, 10: 2, 9: 2, 8: 2, 7: 2 }, black: { 24: 15 } };
    const s = position(F, spec, 0, [3, 1]);
    const ends = new MoveGenerator(rules, 0)
      .turnOptions(s.board, [3, 1])
      .map((o) => o.moves.map((m) => formatMove(F, 0, m)).join(" "));
    expect(ends.some((e) => e.includes("9/6") && e.includes("6/5"))).toBe(true);
  });

  it("never blocks all six points of the own starting quarter", () => {
    const rules = getVariant(F);
    // White on own 24, 23, 22, 21, 20 and 19: the starting quarter is closed.
    const closed = boardFromSpec(rules, {
      white: { 24: 5, 23: 2, 22: 2, 21: 2, 20: 2, 19: 2 },
      black: { 24: 14, 2: 1 },
    });
    expect(violatesFevgaPrime(rules, closed, 0)).toBe(true);
  });
});
