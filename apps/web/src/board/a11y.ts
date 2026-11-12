import {
  type Board,
  formatMove,
  type GameState,
  getVariant,
  ownPoint,
  type Player,
  pipCount,
} from "@tavli/engine";
import { type Dict, turnText } from "../i18n";

/**
 * Keyboard and screen reader support for the board.
 *
 * The board is navigated as a grid of physical cells, laid out like the unrotated, unmirrored
 * drawing: two rows (top, bottom) of 14 columns – six points, the bar, six points, the bear-off
 * tray. Bar and tray span both rows. Arrow keys are translated from what the user sees (the board
 * may be turned by 90° and/or mirrored) into steps on this grid, so "right" always moves focus to
 * the cell drawn to the right of the current one.
 */

/** A focusable cell: a physical point index (as drawn, see geometry.ts), the bar or the tray. */
export type Cell = number | "bar" | "tray";

export interface GridPos {
  /** 0 = top row, 1 = bottom row (unrotated drawing). */
  readonly row: 0 | 1;
  /** 0..13 from left to right (unmirrored drawing). */
  readonly col: number;
}

const BAR_COL = 6;
const TRAY_COL = 13;
const LAST_COL = TRAY_COL;

/** The cell drawn at a grid position (physical point numbering follows geometry.ts). */
export const cellAt = ({ row, col }: GridPos): Cell => {
  if (col === BAR_COL) return "bar";
  if (col === TRAY_COL) return "tray";
  if (row === 0) return col < BAR_COL ? 12 + col : 18 + (col - BAR_COL - 1);
  return col < BAR_COL ? 11 - col : 5 - (col - BAR_COL - 1);
};

/**
 * Grid position of a cell. Bar and tray span both rows; `row` keeps the row the user came from
 * so that leaving them sideways returns to the same half of the board.
 */
export const posOf = (cell: Cell, row: 0 | 1 = 0): GridPos => {
  if (cell === "bar") return { row, col: BAR_COL };
  if (cell === "tray") return { row, col: TRAY_COL };
  if (cell >= 12) return { row: 0, col: cell < 18 ? cell - 12 : cell - 18 + BAR_COL + 1 };
  return { row: 1, col: cell >= 6 ? 11 - cell : 5 - cell + BAR_COL + 1 };
};

/** Step on the grid for an arrow key as seen on screen, or null for other keys. */
const stepFor = (key: string, rotated: boolean, mirrored: boolean): { dCol: number; dRow: number } | null => {
  // Portrait: the drawing is turned clockwise, so board columns run top to bottom on screen and
  // the board's top row ends up on the right.
  const steps: Record<string, { dCol: number; dRow: number }> = rotated
    ? {
        ArrowDown: { dCol: 1, dRow: 0 },
        ArrowUp: { dCol: -1, dRow: 0 },
        ArrowRight: { dCol: 0, dRow: -1 },
        ArrowLeft: { dCol: 0, dRow: 1 },
      }
    : {
        ArrowRight: { dCol: 1, dRow: 0 },
        ArrowLeft: { dCol: -1, dRow: 0 },
        ArrowUp: { dCol: 0, dRow: -1 },
        ArrowDown: { dCol: 0, dRow: 1 },
      };
  const step = steps[key];
  if (!step) return null;
  // Mirroring flips the drawing before it is turned, i.e. it reverses the board columns.
  return mirrored ? { dCol: -step.dCol, dRow: step.dRow } : step;
};

/**
 * Where focus goes for a key press: arrows move to the neighbouring cell (stopping at the edges),
 * Home/End jump to the first/last column of the row as drawn. Returns null for other keys.
 */
export const navigate = (pos: GridPos, key: string, rotated: boolean, mirrored: boolean): GridPos | null => {
  if (key === "Home" || key === "End") {
    const first = (key === "Home") !== mirrored;
    return { row: pos.row, col: first ? 0 : LAST_COL };
  }
  const step = stepFor(key, rotated, mirrored);
  if (!step) return null;
  const col = Math.min(LAST_COL, Math.max(0, pos.col + step.dCol));
  const row = Math.min(1, Math.max(0, pos.row + step.dRow)) as 0 | 1;
  return { row, col };
};

/** All cells in document (tab) order. */
export const ALL_CELLS: readonly Cell[] = [
  ...Array.from({ length: 6 }, (_, c) => cellAt({ row: 0, col: c })),
  ...Array.from({ length: 6 }, (_, c) => cellAt({ row: 0, col: BAR_COL + 1 + c })),
  ...Array.from({ length: 6 }, (_, c) => cellAt({ row: 1, col: c })),
  ...Array.from({ length: 6 }, (_, c) => cellAt({ row: 1, col: BAR_COL + 1 + c })),
  "bar",
  "tray",
];

// ---- labels ---------------------------------------------------------------------------------

/** "5 weiße Steine" / "1 white checker". */
export const checkersText = (t: Dict, p: Player, n: number): string => {
  const words =
    p === 0 ? (n === 1 ? t.a11yWhiteOne : t.a11yWhiteMany) : n === 1 ? t.a11yBlackOne : t.a11yBlackMany;
  return `${n} ${words}`;
};

/** Contents of a slot as text, e.g. "2 weiße Steine, 1 schwarzer Stein (gefangen)"; "leer" if empty. */
const contentsText = (t: Dict, counts: readonly [number, number], pinned: Player | null): string => {
  const parts = ([0, 1] as const)
    .filter((p) => counts[p] > 0)
    .map((p) => `${checkersText(t, p, counts[p])}${pinned === p ? ` (${t.a11yPinned})` : ""}`);
  return parts.length > 0 ? parts.join(", ") : t.a11yEmpty;
};

export interface CellFlags {
  /** A checker of the player on turn can be picked up here. */
  readonly movable: boolean;
  /** The picked-up checker can be moved here. */
  readonly target: boolean;
  /** This is where the picked-up checker comes from. */
  readonly selected: boolean;
}

const flagsText = (t: Dict, f: CellFlags): string =>
  [f.selected && t.a11ySelected, f.target && t.a11yTarget, !f.selected && f.movable && t.a11yMovable]
    .filter(Boolean)
    .map((s) => `, ${s}`)
    .join("");

/**
 * Accessible name of a cell, e.g. "Punkt 13: 5 weiße Steine, Ziel möglich". Point numbers are
 * given from `numbersFor`'s perspective, matching the numbers drawn on the board.
 */
export const cellLabel = (
  t: Dict,
  board: Board,
  cell: { readonly abs: number } | "bar" | "tray",
  numberLabel: number | null,
  flags: CellFlags,
): string => {
  if (cell === "bar") return `${t.a11yBar}: ${contentsText(t, board.bar, null)}${flagsText(t, flags)}`;
  if (cell === "tray") return `${t.a11yOff}: ${contentsText(t, board.off, null)}${flagsText(t, flags)}`;
  const counts = [board.points[0][cell.abs] ?? 0, board.points[1][cell.abs] ?? 0] as const;
  const pinned = board.pinned[cell.abs] ?? null;
  const name = numberLabel === null ? t.a11yPoint : `${t.a11yPoint} ${numberLabel}`;
  return `${name}: ${contentsText(t, counts, pinned)}${flagsText(t, flags)}`;
};

const colour = (t: Dict, p: Player) => (p === 0 ? t.playerWhite : t.playerBlack);

/** Whose turn it is and what they are doing, e.g. "Weiß ist am Zug". */
const turnPhrase = (t: Dict, s: GameState): string => {
  switch (s.phase) {
    case "opening":
      return t.openingRoll;
    case "rolling":
      return `${colour(t, s.turn)} ${t.toRoll}`;
    case "moving":
      return `${colour(t, s.turn)} ${t.toMove}`;
    case "cube-offered":
      return `${colour(t, s.turn)} ${t.offersDouble} ${s.cube.value * 2}`;
    case "finished":
      return s.result ? `${colour(t, s.result.winner)} ${t.wins}` : "";
  }
};

/** The most recent move in standard notation: moves of the running turn, else the last record. */
const lastMoveText = (t: Dict, s: GameState): string | null => {
  if (s.played.length > 0) {
    const moves = s.played.map((m) => formatMove(s.variant, s.turn, m)).join(" ");
    return `${t.a11yLastMove} ${colour(t, s.turn)}: ${moves}`;
  }
  const rec = s.history[s.history.length - 1];
  if (!rec) return null;
  return `${t.a11yLastMove} ${colour(t, rec.player)}: ${turnText(t, s.variant, rec)}`;
};

/**
 * Spoken summary of the position for the live region: turn, dice (with the ones still to play),
 * pip counts and the last move, e.g. "Weiß ist am Zug. Würfel 6 3, übrig 3. Pips: Weiß 160,
 * Schwarz 167. Letzter Zug Weiß: 13/7."
 */
export const positionSummary = (t: Dict, s: GameState): string => {
  const rules = getVariant(s.variant);
  const parts = [turnPhrase(t, s)];
  if (s.phase === "moving" && s.dice) {
    parts.push(`${t.a11yDice} ${s.dice.join(" ")}, ${t.a11yRemaining} ${s.remaining.join(" ") || "–"}`);
  }
  parts.push(
    `${t.pips}: ${t.playerWhite} ${pipCount(rules, s.board, 0)}, ${t.playerBlack} ${pipCount(rules, s.board, 1)}`,
  );
  const last = lastMoveText(t, s);
  if (last) parts.push(last);
  return `${parts.filter(Boolean).join(". ")}.`;
};

/** Own point number of an absolute point, as drawn next to the point for `numbersFor`. */
export const pointNumber = (s: GameState, numbersFor: Player, abs: number): number =>
  ownPoint(getVariant(s.variant), numbersFor, abs);
