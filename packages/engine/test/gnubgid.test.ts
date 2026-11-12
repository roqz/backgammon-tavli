import { describe, expect, it } from "vitest";
import { applyAction, createGame, gameFromXgid, parseGnubgId, toGnubgId, toXgid } from "../src";
import { position } from "./helpers";

describe("GNU Backgammon ID", () => {
  it("encodes the starting position as gnubg does", () => {
    const g = createGame({ variant: "backgammon", starter: 0 });
    const [pos] = toGnubgId({ ...g, phase: "rolling" }).split(":");
    expect(pos).toBe("4HPwATDgc/ABMA");
  });

  it("decodes gnubg's match ID for a fresh money game", () => {
    const x = parseGnubgId("4HPwATDgc/ABMA:cAkAAAAAAAAA");
    expect(x).toMatchObject({
      length: 0,
      cube: { value: 1, owner: null },
      dice: null,
      doubled: false,
      crawford: false,
    });
    expect(x.turn).toBe(0);
  });

  it("round-trips positions, dice, cube, scores and Crawford", () => {
    let g = position(
      "backgammon",
      { white: { 24: 1, 13: 6, 8: 3, 6: 4 }, black: { 20: 2, 13: 5, 8: 3, 6: 4 }, bar: [1, 1] },
      1,
      [5, 2],
    );
    g = { ...g, cube: { value: 4, owner: 0, enabled: true } };
    const id = toGnubgId(g, { score: [3, 5], length: 7, crawford: true });
    const x = parseGnubgId(`GNUbg ID: ${id}`);
    expect(x).toMatchObject({
      turn: 1,
      dice: [5, 2],
      score: [3, 5],
      length: 7,
      crawford: true,
      cube: { value: 4, owner: 0 },
    });
    // same position as XGID sees it
    const back = gameFromXgid(x);
    expect(toXgid(back, { score: [3, 5], length: 7, crawford: true })).toBe(
      toXgid(g, { score: [3, 5], length: 7, crawford: true }),
    );
  });

  it("an offered double: the opponent decides", () => {
    let g = createGame({ variant: "backgammon", starter: 0 });
    g = applyAction({ ...g, phase: "rolling" }, { type: "double" });
    const x = parseGnubgId(toGnubgId(g));
    expect(x).toMatchObject({ turn: 0, doubled: true });
  });

  it("rejects malformed IDs", () => {
    expect(() => parseGnubgId("nope")).toThrow();
    expect(() => parseGnubgId("4HPwATDgc/ABMA:short")).toThrow();
  });
});
