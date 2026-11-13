import { describe, expect, it } from "vitest";
import { applyAction, canDouble, createGame, createMatch } from "../src";

describe("cube limit", () => {
  it("no double beyond the limit, also in every game of a match", () => {
    let s = createGame({ variant: "backgammon", cubeLimit: 4, starter: 0 });
    for (const [doubler, ok] of [
      [0, true],
      [1, true],
      [0, false],
    ] as const) {
      expect(s.turn).toBe(doubler);
      expect(canDouble(s)).toBe(ok);
      if (!ok) break;
      s = applyAction(applyAction(s, { type: "double" }), { type: "take" });
      // the taker is on roll next in this test
      s = { ...s, turn: s.cube.owner! };
    }
    expect(s.cube.value).toBe(4);
    expect(() => applyAction(s, { type: "double" })).toThrow();
    expect(createMatch({ variant: "backgammon", length: 0, cubeLimit: 64 }).game.cube.limit).toBe(64);
    expect(createGame({ variant: "backgammon" }).cube.limit).toBeUndefined();
  });
});
