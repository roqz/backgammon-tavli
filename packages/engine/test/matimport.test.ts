import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyMoveUnchecked,
  createGame,
  fromMat,
  getVariant,
  initialBoard,
  legalMoves,
  rollDice,
  seededRng,
  type TurnRecord,
  toMat,
} from "../src";

/** A random but legal game. */
const randomGame = (seed: number) => {
  const rng = seededRng(seed);
  let s = createGame({ variant: "backgammon", starter: 0 });
  for (let i = 0; i < 400 && s.phase !== "finished"; i++) {
    if (s.phase === "rolling") s = applyAction(s, { type: "roll", dice: rollDice(rng) });
    else if (s.phase === "moving") {
      const moves = legalMoves(s);
      s = moves.length
        ? applyAction(s, { type: "move", move: moves[Math.floor(rng() * moves.length)]! })
        : applyAction(s, { type: "confirm" });
    }
  }
  return s;
};

/** The position after every turn record. */
const boardsAfterEachTurn = (history: readonly TurnRecord[]) => {
  const rules = getVariant("backgammon");
  let board = initialBoard(rules);
  return history.map((rec) => {
    if (rec.kind === "move")
      for (const m of rec.moves) board = applyMoveUnchecked(rules, board, rec.player, m).board;
    return JSON.stringify([board.points, board.bar, board.off]);
  });
};

describe(".mat import", () => {
  it("reads back what the export wrote: same positions after every turn", () => {
    for (const seed of [1, 2, 3]) {
      const g = randomGame(seed);
      const text = toMat({
        variant: "backgammon",
        length: 5,
        players: ["Alice", "Bob"],
        games: [{ history: g.history, result: g.result, score: [0, 0] }],
      });
      const m = fromMat(text);
      expect(m.players).toEqual(["Alice", "Bob"]);
      expect(m.length).toBe(5);
      expect(m.games[0]!.result).toMatchObject({ winner: g.result!.winner, points: g.result!.points });
      // moves may be written differently (13/11 11/5 = 13/7 7/5), the positions must match
      expect(boardsAfterEachTurn(m.games[0]!.history)).toEqual(boardsAfterEachTurn(g.history));
    }
  });

  it("understands gnubg style lines with chains, multiples and the cube", () => {
    const text = [
      " 3 point match",
      "",
      " Game 1",
      " Alice : 0                          Bob : 0",
      "  1) 31: 8/5 6/5                     65: 24/13",
      "  2) 44: 24/20(2) 13/9(2)             Doubles => 2",
      "  3)  Drops",
      "",
      "                                       Wins 1 point",
    ].join("\n");
    const m = fromMat(text);
    expect(m.games[0]!.history.map((r) => r.kind)).toEqual(["move", "move", "move", "double", "drop"]);
    expect(m.games[0]!.result).toMatchObject({ winner: 1, points: 1 });
  });

  it("names the game and the move that is not legal", () => {
    const bad = " 1 point match\n\n Game 1\n A : 0                              B : 0\n  1) 31: 24/18\n";
    expect(() => fromMat(bad)).toThrow(/game 1: move "24\/18" is not legal with 31/);
  });
});
