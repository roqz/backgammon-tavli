import {
  applyAction,
  type BoardSpec,
  boardFromSpec,
  createGame,
  type Dice,
  formatMove,
  type GameState,
  getVariant,
  legalMoves,
  type Move,
  type Player,
  type VariantId,
} from "../src";
import { absFromOwnPoint } from "../src/variants";

/** A game in the `moving` phase with the given position, player on turn and dice. */
export const position = (variant: VariantId, spec: BoardSpec, turn: Player, dice: Dice): GameState => {
  const s = createGame({ variant, board: boardFromSpec(getVariant(variant), spec), starter: turn });
  return applyAction(s, { type: "roll", dice });
};

/** Legal next moves in notation, sorted, e.g. `["13/10", "24/21"]` (dice not shown). */
export const legal = (s: GameState): string[] =>
  [...new Set(legalMoves(s).map((m) => formatMove(s.variant, s.turn, { ...m, hit: false })))].sort();

/** Build a move from own point numbers (`"bar"` / `"off"` allowed). */
export const mv = (
  variant: VariantId,
  player: Player,
  from: number | "bar",
  to: number | "off",
  die: number,
): Move => {
  const rules = getVariant(variant);
  return {
    from: from === "bar" ? "bar" : absFromOwnPoint(rules, player, from),
    to: to === "off" ? "off" : absFromOwnPoint(rules, player, to),
    die,
  };
};

export const play = (s: GameState, ...moves: Move[]): GameState =>
  moves.reduce((acc, move) => applyAction(acc, { type: "move", move }), s);
