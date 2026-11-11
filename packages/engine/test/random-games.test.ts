import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  type Board,
  checkerTotal,
  createGame,
  type GameState,
  legalMoves,
  moveGenerator,
  type Player,
  type Rng,
  rollDice,
  seededRng,
  type VariantId,
} from "../src";

const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];

const checkInvariants = (b: Board) => {
  for (const p of [0, 1] as Player[]) expect(checkerTotal(b, p)).toBe(15);
  for (let i = 0; i < 24; i++) {
    const both = b.points[0][i]! > 0 && b.points[1][i]! > 0;
    // Two colours may only share a point when one is pinned (Plakoto).
    if (both) expect(b.pinned[i]).not.toBeNull();
    if (b.pinned[i] !== null) expect(both).toBe(true);
  }
};

/** Plays a full game choosing random legal moves. Returns the final state. */
const playRandomGame = (variant: VariantId, rng: Rng): GameState => {
  let s = createGame({ variant });
  for (let step = 0; step < 5000 && s.phase !== "finished"; step++) {
    switch (s.phase) {
      case "opening":
      case "rolling":
        s = applyAction(s, { type: "roll", dice: rollDice(rng) });
        break;
      case "moving": {
        const moves = legalMoves(s);
        if (moves.length === 0) {
          s = applyAction(s, { type: "confirm" });
        } else {
          s = applyAction(s, { type: "move", move: moves[Math.floor(rng() * moves.length)]! });
        }
        break;
      }
      case "cube-offered":
        s = applyAction(s, { type: "take" });
        break;
    }
    checkInvariants(s.board);
  }
  return s;
};

describe("random self-play (property based)", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: every random game ends legally with consistent boards`, () => {
      fc.assert(
        fc.property(fc.integer(), (seed) => {
          const end = playRandomGame(variant, seededRng(seed));
          expect(end.phase).toBe("finished");
          expect(end.result!.points).toBeGreaterThan(0);
          const { winner, reason } = end.result!;
          if (reason === "bear-off") expect(end.board.off[winner]).toBe(15);
          else expect(reason).toBe("mana");
        }),
        { numRuns: 25 },
      );
    });
  }

  it("every full turn option uses the maximum number of dice", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(...VARIANTS), (seed, variant) => {
        const rng = seededRng(seed);
        let s = createGame({ variant, starter: 0 });
        // advance a few random turns to reach a varied position
        for (let i = 0; i < 30 && s.phase !== "finished"; i++) {
          if (s.phase === "rolling") s = applyAction(s, { type: "roll", dice: rollDice(rng) });
          else if (s.phase === "moving") {
            const moves = legalMoves(s);
            s = moves.length
              ? applyAction(s, { type: "move", move: moves[Math.floor(rng() * moves.length)]! })
              : applyAction(s, { type: "confirm" });
          }
        }
        if (s.phase !== "moving") return;
        const gen = moveGenerator(s.variant, s.turn);
        const max = gen.maxPlayable(s.board, s.remaining);
        for (const opt of gen.turnOptions(s.board, s.remaining)) {
          if (opt.end) expect(opt.moves.length).toBeLessThanOrEqual(max);
          else expect(opt.moves.length).toBe(max);
        }
      }),
      { numRuns: 100 },
    );
  });
});
