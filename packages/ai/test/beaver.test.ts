import { applyAction, type Board, createGame } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { shouldBeaver, shouldRaccoon } from "../src";

const pts = (at: number) => Array.from({ length: 24 }, (_, i) => (i === at ? 15 : 0));

describe("beaver and raccoon decisions", () => {
  it("beavers a hopeless double and does not raccoon it", () => {
    // White (to roll) far behind in the race: all checkers still on its 24-point; Black is home.
    const board: Board = {
      points: [pts(23), pts(23)],
      pinned: Array(24).fill(null),
      bar: [0, 0],
      off: [0, 0],
    };
    const doubled = applyAction(createGame({ variant: "backgammon", beavers: true, starter: 0, board }), {
      type: "double",
    });
    expect(shouldBeaver(doubled, "hard")).toBe(true);
    expect(shouldBeaver(doubled, "easy")).toBe(false);
    const beavered = applyAction(doubled, { type: "beaver" });
    expect(shouldRaccoon(beavered, "hard")).toBe(false);
  });

  it("no beaver at the start of a game", () => {
    const doubled = applyAction(createGame({ variant: "backgammon", beavers: true, starter: 0 }), {
      type: "double",
    });
    expect(shouldBeaver(doubled, "hard")).toBe(false);
  });
});
