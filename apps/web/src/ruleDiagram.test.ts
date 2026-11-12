import { applyAction, getVariant } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { DIAGRAMS, stateOf } from "./screens/RuleDiagram";

describe("rule diagrams", () => {
  it("are valid positions with 15 checkers each and legal arrows", () => {
    for (const [id, d] of Object.entries(DIAGRAMS)) {
      const { state, hint } = stateOf(d);
      const board = state.board;
      for (const p of [0, 1] as const) {
        const onBoard = board.points[p].reduce((s, n) => s + n, 0);
        expect(onBoard + board.bar[p] + board.off[p], `${id} player ${p}`).toBe(15);
      }
      if (d.variant !== "plakoto")
        for (let i = 0; i < 24; i++)
          expect(board.points[0][i]! > 0 && board.points[1][i]! > 0, `${id} point ${i}`).toBe(false);
      // every arrow is a legal move of white, one after the other
      let s = state;
      for (const move of hint ?? []) s = applyAction(s, { type: "move", move });
      expect(getVariant(d.variant).id).toBe(d.variant);
    }
  });
});
