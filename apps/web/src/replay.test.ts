import {
  applyAction,
  createGame,
  type GameState,
  legalMoves,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { buildFrames } from "./replay";

const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];

const randomGame = (variant: VariantId, seed: number): GameState => {
  const rng = seededRng(seed);
  let g = createGame({ variant });
  for (let i = 0; i < 3000 && g.phase !== "finished"; i++) {
    if (g.phase === "opening" || g.phase === "rolling")
      g = applyAction(g, { type: "roll", dice: rollDice(rng) });
    else if (g.phase === "cube-offered") g = applyAction(g, { type: "take" });
    else {
      const moves = legalMoves(g);
      g = moves.length
        ? applyAction(g, { type: "move", move: moves[Math.floor(rng() * moves.length)]! })
        : applyAction(g, { type: "confirm" });
    }
  }
  return g;
};

describe("replay", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: the last frame reproduces the final position`, () => {
      const g = randomGame(variant, 11);
      expect(g.phase).toBe("finished");
      const frames = buildFrames(variant, g.history);
      expect(frames.at(-1)!.state.board).toEqual(g.board);
      expect(frames.length).toBeGreaterThan(g.history.length);
    });
  }
});
