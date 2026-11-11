import { describe, expect, it } from "vitest";
import { applyMatchAction, createMatch, type MatchState, variantOfGame } from "../src";

const resign = (m: MatchState, loser: 0 | 1, level: 1 | 2 | 3 = 1) =>
  applyMatchAction(m, { type: "resign", player: loser, level });

describe("match play", () => {
  it("rotates Portes, Plakoto, Fevga in a tavli match", () => {
    const cfg = { variant: "tavli" as const, length: 5 };
    expect([0, 1, 2, 3].map((i) => variantOfGame(cfg, i))).toEqual(["portes", "plakoto", "fevga", "portes"]);
  });

  it("tavli: the winner of the previous game starts the next one", () => {
    let m = createMatch({ variant: "tavli", length: 5 });
    m = resign(m, 0);
    m = applyMatchAction(m, { type: "next-game" });
    expect(m.game.variant).toBe("plakoto");
    expect(m.game).toMatchObject({ phase: "rolling", turn: 1 });
  });

  it("backgammon: every game starts with an opening roll", () => {
    let m = createMatch({ variant: "backgammon", length: 5 });
    m = applyMatchAction(resign(m, 0), { type: "next-game" });
    expect(m.game.phase).toBe("opening");
  });

  it("applies the Crawford rule", () => {
    let m = createMatch({ variant: "backgammon", length: 3 });
    expect(m.game.cube.enabled).toBe(true);
    m = resign(m, 1, 2); // white 2:0
    m = applyMatchAction(m, { type: "next-game" });
    expect(m.crawford).toBe("crawford-game");
    expect(m.game.cube.enabled).toBe(false);
    m = resign(m, 0); // black 2:1
    m = applyMatchAction(m, { type: "next-game" });
    expect(m.crawford).toBe("done");
    expect(m.game.cube.enabled).toBe(true);
  });

  it("ends the match when a player reaches the target", () => {
    let m = createMatch({ variant: "backgammon", length: 3 });
    m = resign(m, 1, 3);
    expect(m.score).toEqual([3, 0]);
    expect(m.winner).toBe(0);
    expect(() => applyMatchAction(m, { type: "next-game" })).toThrow();
  });

  it("disables the cube in 1-point matches", () => {
    expect(createMatch({ variant: "backgammon", length: 1 }).game.cube.enabled).toBe(false);
  });
});
