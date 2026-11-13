import { applyAction, createGame, getVariant, initialBoard, seededRng, turnOptions } from "@tavli/engine";
import { describe, expect, it } from "vitest";
import { chooseMoves, hasNet, loadNet, netFor, netOutcomes, packNet, unpackNet } from "../src";
import { randomNet } from "../src/nn";

const rolled = (variant: "backgammon" | "fevga", dice: [number, number]) =>
  applyAction(createGame({ variant, cube: false }), { type: "roll", dice });

describe("neural network evaluation", () => {
  it("packs and unpacks weights (int16) almost exactly", () => {
    const net = randomNet("backgammon", 16, seededRng(3));
    const back = unpackNet(packNet(net));
    expect(back.hidden).toBe(16);
    expect(back.inputs).toBe(net.inputs);
    for (const k of ["w1", "b1", "w2"] as const)
      for (let i = 0; i < net[k].length; i += 37) expect(back[k][i]).toBeCloseTo(net[k][i]!, 4);
  });

  it("the trained backgammon network gives consistent chances", async () => {
    expect(hasNet("backgammon")).toBe(true);
    expect(hasNet("plakoto")).toBe(false);
    expect(hasNet("hypergammon")).toBe(false);
    const net = (await loadNet("backgammon"))!;
    expect(netFor("backgammon")).toBe(net);
    const b = initialBoard(getVariant("backgammon"));
    const white = netOutcomes(net, "backgammon", b, 0, 0);
    const black = netOutcomes(net, "backgammon", b, 1, 0);
    expect(white.win + black.win).toBeCloseTo(1, 6);
    expect(white.gammonWin).toBeCloseTo(black.gammonLoss, 6);
    // on roll at the start: a small edge, no certainties
    expect(white.win).toBeGreaterThan(0.45);
    expect(white.win).toBeLessThan(0.6);
    for (const v of Object.values(white)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("the expert plays legal moves with the network and like hard without one", async () => {
    await loadNet("backgammon");
    const s = rolled("backgammon", [3, 1]);
    const moves = chooseMoves(s, "expert", seededRng(1));
    const legal = turnOptions(s).map((o) => JSON.stringify(o.moves.map(({ from, to }) => [from, to])));
    expect(legal).toContain(JSON.stringify(moves.map(({ from, to }) => [from, to])));
    // 3-1 opening: everyone makes the 5-point
    let after = s;
    for (const move of moves) after = applyAction(after, { type: "move", move });
    expect(after.board.points[s.turn][getVariant("backgammon").paths[s.turn][19]!]).toBe(2);
    const f = rolled("fevga", [6, 5]);
    expect(chooseMoves(f, "expert", seededRng(2))).toEqual(chooseMoves(f, "hard", seededRng(2)));
  });
});
