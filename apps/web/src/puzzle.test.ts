import { applyAction } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { generatePuzzle, gradePuzzle, streak } from "./puzzle";

describe("daily puzzle", () => {
  it("is deterministic per date, rotates variants and has a clear best move", () => {
    const dates = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
    const puzzles = dates.map(generatePuzzle);
    expect(new Set(puzzles.map((p) => p.variant)).size).toBe(4);
    const again = generatePuzzle("2026-11-12");
    expect(again.best).toEqual(puzzles[0]!.best);
    for (const p of puzzles) {
      expect(p.gap).toBeGreaterThanOrEqual(0.06);
      expect(p.options).toBeGreaterThanOrEqual(4);
      let s = p.state;
      for (const move of p.best) s = applyAction(s, { type: "move", move });
      expect(gradePuzzle(p, s.board)).toEqual({ solved: true, loss: 0 });
    }
  }, 120_000);

  it("counts solved days in a row", () => {
    const ok = { solved: true, loss: 0 };
    const results = { "2026-11-10": ok, "2026-11-11": ok, "2026-11-12": ok, "2026-11-08": ok };
    expect(streak(results, "2026-11-12")).toBe(3);
    expect(streak({ "2026-11-11": ok }, "2026-11-12")).toBe(1);
    expect(streak({}, "2026-11-12")).toBe(0);
  });
});
