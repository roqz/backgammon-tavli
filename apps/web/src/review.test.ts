import { chooseMoves } from "@tavli/ai";
import { applyAction, createGame, rollDice, seededRng } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { classify, reviewGame } from "./review";

/** A game where white plays like the strong bot and black randomly-ish (easy bot). */
const game = (seed: number) => {
  const rng = seededRng(seed);
  let s = createGame({ variant: "portes", starter: 0 });
  for (let i = 0; s.phase !== "finished" && i < 200; i++) {
    if (s.phase === "moving") {
      for (const move of chooseMoves(s, s.turn === 0 ? "hard" : "easy", rng))
        s = applyAction(s, { type: "move", move });
      if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
    } else s = applyAction(s, { type: "roll", dice: rollDice(rng) });
  }
  return s.history;
};

describe("game review", () => {
  it("classifies losses", () => {
    expect([0, 0.03, 0.1, 0.2].map(classify)).toEqual(["ok", "inaccurate", "error", "blunder"]);
  });

  it("finds the weaker player's mistakes and shows better moves", () => {
    const history = game(3);
    const r = reviewGame("portes", history);
    const [strong, weak] = r.players;
    expect(strong.decisions).toBeGreaterThan(5);
    expect(weak.decisions).toBeGreaterThan(5);
    expect(weak.errorRate).toBeGreaterThan(strong.errorRate);
    const worst = r.turns.filter((t) => t.player === 1).sort((a, b) => b.loss - a.loss)[0]!;
    expect(worst.best).not.toBe(worst.played);
    expect(worst.best).toMatch(/\d+\/\d+/);
  }, 60_000);
});
