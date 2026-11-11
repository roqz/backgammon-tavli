import {
  applyAction,
  boardFromSpec,
  createGame,
  type GameState,
  getVariant,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { describe, expect, it } from "vitest";
import {
  chooseMoves,
  evaluate,
  gammonChances,
  shouldAcceptResign,
  shouldDouble,
  shouldTake,
  winProbability,
} from "../src";
import { duel, playGame } from "./selfplay";

const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];

describe("evaluate", () => {
  it("is antisymmetric on positions from random games", () => {
    for (const variant of VARIANTS) {
      const rng = seededRng(7);
      let checked = 0;
      playGame(variant, ["easy", "easy"], rng, (s) => {
        if (checked++ % 5 !== 0) return;
        expect(evaluate(variant, s.board, 0, 0)).toBeCloseTo(-evaluate(variant, s.board, 1, 0), 6);
        expect(evaluate(variant, s.board, 0, 1)).toBeCloseTo(-evaluate(variant, s.board, 1, 1), 6);
      });
    }
  });

  it("prefers a pip lead in a race", () => {
    const rules = getVariant("backgammon");
    const board = boardFromSpec(rules, { white: { 3: 15 }, black: { 6: 15 } });
    expect(evaluate("backgammon", board, 0)).toBeGreaterThan(0);
    expect(winProbability("backgammon", board, 0)).toBeGreaterThan(0.9);
  });
});

describe("chooseMoves", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: every level plays only legal, complete turns`, () => {
      for (const level of ["easy", "medium", "hard"] as const) {
        const rng = seededRng(level.length * 13);
        let s: GameState = applyAction(createGame({ variant, starter: 0 }), { type: "roll", dice: [6, 4] });
        for (const move of chooseMoves(s, level, rng)) s = applyAction(s, { type: "move", move });
        expect(s.phase === "finished" || s.remaining.length === 0).toBe(true);
      }
    });
  }

  it("hits a blot when it is clearly good", () => {
    // Black blot on white's 5-point in white's home, white can hit with the 3 from the 8-point.
    const rules = getVariant("backgammon");
    const board = boardFromSpec(rules, {
      white: { 8: 3, 6: 5, 13: 5, 24: 2 },
      black: { 20: 1, 13: 5, 8: 3, 6: 5, 24: 1 },
    });
    let s = applyAction(createGame({ variant: "backgammon", board, starter: 0 }), {
      type: "roll",
      dice: [3, 1],
    });
    for (const move of chooseMoves(s, "medium", seededRng(1))) s = applyAction(s, { type: "move", move });
    expect(s.board.bar[1]).toBe(1);
  });

  it("hard level decides within a reasonable time", () => {
    const s = applyAction(createGame({ variant: "backgammon", starter: 0 }), { type: "roll", dice: [2, 1] });
    const t0 = Date.now();
    chooseMoves(s, "hard", seededRng(3));
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe("cube", () => {
  const race = (white: Record<number, number>, black: Record<number, number>) =>
    createGame({
      variant: "backgammon",
      board: boardFromSpec(getVariant("backgammon"), { white, black }),
      starter: 0,
    });

  it("doubles a clearly winning race and the opponent passes", () => {
    const s = race({ 2: 15 }, { 6: 15 });
    expect(shouldDouble(s, "hard")).toBe(true);
    expect(shouldTake(applyAction(s, { type: "double" }), "hard")).toBe(false);
  });

  it("does not double an even position and takes a close one", () => {
    const s = createGame({ variant: "backgammon", starter: 0 });
    expect(shouldDouble(s, "hard")).toBe(false);
    expect(shouldTake(applyAction(s, { type: "double" }), "hard")).toBe(true);
  });

  it("easy bots never double", () => {
    expect(shouldDouble(race({ 2: 15 }, { 6: 15 }), "easy")).toBe(false);
  });

  it("post-Crawford trailer doubles immediately", () => {
    const s = createGame({ variant: "backgammon", starter: 0 });
    expect(shouldDouble(s, "medium", { length: 5, score: [1, 4], crawford: "done" })).toBe(true);
  });
});

describe("strength", () => {
  it("medium beats easy in backgammon", () => {
    const r = duel("backgammon", "medium", "easy", 30, seededRng(2024));
    expect(r.aWins / r.games).toBeGreaterThan(0.55);
  }, 60_000);

  it("medium beats easy in plakoto", () => {
    const r = duel("plakoto", "medium", "easy", 30, seededRng(77));
    expect(r.aWins / r.games).toBeGreaterThan(0.55);
  }, 60_000);
});

describe("resignation offers", () => {
  const rules = getVariant("backgammon");
  const offer = (spec: Parameters<typeof boardFromSpec>[1], level: 1 | 2 | 3): GameState => {
    const g = createGame({ variant: "backgammon", starter: 1, board: boardFromSpec(rules, spec) });
    return applyAction(g, { type: "offer-resign", player: 1, level });
  };

  it("accepts a single game when no gammon is possible", () => {
    // white is far ahead, but black has already borne off a checker
    expect(shouldAcceptResign(offer({ white: { 1: 2 }, black: { 24: 1, 1: 13 }, off: [13, 1] }, 1))).toBe(
      true,
    );
  });

  it("refuses a single game when a gammon is likely and accepts the gammon", () => {
    const spec = { white: { 1: 2, 2: 2 }, black: { 13: 15 }, off: [11, 0] as const };
    expect(gammonChances("backgammon", boardFromSpec(rules, spec), 0).gammon).toBeGreaterThan(0.8);
    expect(shouldAcceptResign(offer(spec, 1))).toBe(false);
    expect(shouldAcceptResign(offer(spec, 2))).toBe(true);
  });
});
