import { describe, expect, it } from "vitest";
import { applyAction, canBeaver, canDouble, canRaccoon, createGame, createMatch, formatTurn } from "../src";

describe("beavers and raccoons", () => {
  it("beaver: take and redouble keeping the cube; raccoon: the doubler redoubles again", () => {
    let s = createGame({ variant: "backgammon", beavers: true, starter: 0 });
    s = applyAction(s, { type: "double" });
    expect(canBeaver(s)).toBe(true);
    s = applyAction(s, { type: "beaver" });
    expect(s.phase).toBe("rolling");
    expect(s.turn).toBe(0);
    expect(s.cube).toMatchObject({ value: 4, owner: 1, beavered: true });
    expect(canDouble(s)).toBe(false);
    expect(canRaccoon(s)).toBe(true);
    s = applyAction(s, { type: "raccoon" });
    expect(s.cube).toMatchObject({ value: 8, owner: 0, beavered: false });
    expect(canRaccoon(s)).toBe(false);
    expect(s.history.slice(-2).map((r) => formatTurn("backgammon", r))).toEqual([
      "Beavers => 4",
      "Raccoons => 8",
    ]);
  });

  it("rolling ends the raccoon chance", () => {
    let s = createGame({ variant: "backgammon", beavers: true, starter: 0 });
    s = applyAction(applyAction(s, { type: "double" }), { type: "beaver" });
    s = applyAction(s, { type: "roll", dice: [3, 1] });
    expect(s.cube.beavered).toBe(false);
    expect(() => applyAction(s, { type: "raccoon" })).toThrow();
  });

  it("only with the option, only in money sessions and within the cube limit", () => {
    const plain = applyAction(createGame({ variant: "backgammon", starter: 0 }), { type: "double" });
    expect(canBeaver(plain)).toBe(false);
    expect(() => applyAction(plain, { type: "beaver" })).toThrow();
    expect(createMatch({ variant: "backgammon", length: 5, beavers: true }).game.beavers).toBeUndefined();
    expect(createMatch({ variant: "backgammon", length: 0, beavers: true }).game.beavers).toBe(true);
    const limited = applyAction(
      createGame({ variant: "backgammon", beavers: true, cubeLimit: 2, starter: 0 }),
      {
        type: "double",
      },
    );
    expect(canBeaver(limited)).toBe(false);
  });
});
