/** Prints the bot's choice for every non-double opening roll (sanity check of the evaluation). */
import {
  applyAction,
  applyMoveUnchecked,
  createGame,
  formatTurn,
  getVariant,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { type BotLevel, chooseMoves } from "../src/bot";

const variant = (process.argv[2] ?? "backgammon") as VariantId;
const level = (process.argv[3] ?? "hard") as BotLevel;
const rules = getVariant(variant);
for (let a = 2; a <= 6; a++) {
  for (let b = 1; b < a; b++) {
    const g = applyAction(createGame({ variant, starter: 0 }), { type: "roll", dice: [a, b] });
    let board = g.board;
    const moves = chooseMoves(g, level, seededRng(1)).map((m) => {
      const r = applyMoveUnchecked(rules, board, 0, m);
      board = r.board;
      return { ...m, hit: r.hit };
    });
    console.log(formatTurn(variant, { kind: "move", player: 0, dice: [a, b], moves }));
  }
}
