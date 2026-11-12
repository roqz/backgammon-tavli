import { describe, expect, it } from "vitest";
import { applyActions, toMat } from "../src";
import { mv, position } from "./helpers";

describe(".mat export", () => {
  it("writes moves in two columns with bar = 25, off = 0, hits, cube and result", () => {
    let g = position(
      "backgammon",
      { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      0,
      [6, 5],
    );
    g = applyActions(g, [
      { type: "move", move: mv("backgammon", 0, 24, 18, 6) },
      { type: "move", move: mv("backgammon", 0, 18, 13, 5) },
      { type: "confirm" },
      { type: "roll", dice: [3, 1] },
      { type: "move", move: mv("backgammon", 1, 8, 5, 3) },
      { type: "move", move: mv("backgammon", 1, 6, 5, 1) },
      { type: "confirm" },
      { type: "double" },
      { type: "drop" },
    ]);
    const text = toMat({
      variant: "backgammon",
      length: 5,
      players: ["Alice", "Bob"],
      games: [{ history: g.history, result: g.result, score: [0, 0] }],
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe(" 5 point match");
    expect(lines[2]).toBe(" Game 1");
    expect(lines[3]).toMatch(/^ Alice : 0 +Bob : 0$/);
    expect(lines[4]).toMatch(/^ {2}1\) 65: 24\/18 18\/13 +31: 8\/5 6\/5$/);
    expect(lines[5]).toMatch(/^ {2}2\) {2}Doubles => 2 +Drops$/);
    expect(lines[6]).toMatch(/^ {2}3\) {7}Wins 1 point$/);
  });
});
