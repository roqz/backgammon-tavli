import type { Board, Player } from "./types";
import { opponent } from "./types";
import { absFromOwnPoint, type OwnPointSetup, type VariantRules } from "./variants";

export const CHECKERS_PER_PLAYER = 15;
export const POINTS = 24;
/** Path indices 18..23 form a player's home board. */
export const HOME_START = 18;

/** Mutable working copy used internally while applying moves. */
export interface MutableBoard {
  points: [number[], number[]];
  pinned: (Player | null)[];
  bar: [number, number];
  off: [number, number];
}

export const emptyBoard = (): Board => ({
  points: [new Array<number>(POINTS).fill(0), new Array<number>(POINTS).fill(0)],
  pinned: new Array<Player | null>(POINTS).fill(null),
  bar: [0, 0],
  off: [0, 0],
});

export const cloneBoard = (b: Board): MutableBoard => ({
  points: [b.points[0].slice(), b.points[1].slice()],
  pinned: b.pinned.slice(),
  bar: [b.bar[0], b.bar[1]],
  off: [b.off[0], b.off[1]],
});

export interface BoardSpec {
  /** Per player: own point number (24..1) -> checker count. */
  readonly white?: OwnPointSetup;
  readonly black?: OwnPointSetup;
  readonly bar?: readonly [number, number];
  readonly off?: readonly [number, number];
  /** Plakoto: own point numbers *from the pinned player's view* where that player's checker is pinned. */
  readonly pinnedWhite?: readonly number[];
  readonly pinnedBlack?: readonly number[];
}

/**
 * Build a board from each player's own point numbering. Handy for tests, puzzles and imports.
 * A pinned checker must be included in its owner's count on that point.
 */
export const boardFromSpec = (rules: VariantRules, spec: BoardSpec): Board => {
  const b = cloneBoard(emptyBoard());
  const place = (player: Player, setup: OwnPointSetup | undefined) => {
    for (const [own, count] of Object.entries(setup ?? {})) {
      b.points[player][absFromOwnPoint(rules, player, Number(own))]! += count;
    }
  };
  place(0, spec.white);
  place(1, spec.black);
  for (const own of spec.pinnedWhite ?? []) b.pinned[absFromOwnPoint(rules, 0, own)] = 0;
  for (const own of spec.pinnedBlack ?? []) b.pinned[absFromOwnPoint(rules, 1, own)] = 1;
  if (spec.bar) b.bar = [spec.bar[0], spec.bar[1]];
  if (spec.off) b.off = [spec.off[0], spec.off[1]];
  return b;
};

export const initialBoard = (rules: VariantRules): Board =>
  boardFromSpec(rules, { white: rules.setup, black: rules.setup });

/** Total number of checkers a player has (on board, bar and off). */
export const checkerTotal = (b: Board, p: Player): number =>
  b.points[p].reduce((s, n) => s + n, 0) + b.bar[p] + b.off[p];

/** Pip count: sum of distances to bear off; checkers on the bar count 25. */
export const pipCount = (rules: VariantRules, b: Board, p: Player): number => {
  const path = rules.paths[p];
  let pips = b.bar[p] * 25;
  for (let k = 0; k < POINTS; k++) pips += b.points[p][path[k]!]! * (POINTS - k);
  return pips;
};

/** True if all of the player's remaining checkers are in the home board (path index >= 18). */
export const allHome = (rules: VariantRules, b: Board, p: Player): boolean => {
  if (b.bar[p] > 0) return false;
  const path = rules.paths[p];
  for (let k = 0; k < HOME_START; k++) if (b.points[p][path[k]!]! > 0) return false;
  return true;
};

/** A checker on this point can move (it exists and is not pinned). */
export const canMoveFrom = (b: Board, p: Player, abs: number): boolean =>
  b.points[p][abs]! > 0 && b.pinned[abs] !== p;

/** Whether player `p` may land on absolute point `abs` under the variant's blot rule. */
export const canLandOn = (rules: VariantRules, b: Board, p: Player, abs: number): boolean => {
  const opp = opponent(p);
  const oppCount = b.points[opp][abs]!;
  switch (rules.blots) {
    case "hit":
      return oppCount <= 1;
    case "none":
      return oppCount === 0;
    case "pin": {
      const pinned = b.pinned[abs];
      // Own checker trapped beneath the opponent: opponent holds the point.
      if (pinned === p) return false;
      // Opponent trapped beneath own checkers: we hold the point.
      if (pinned === opp) return true;
      return oppCount <= 1;
    }
  }
};

/** Stable string key of a board, used to deduplicate positions. */
export const boardKey = (b: Board): string =>
  `${b.points[0].join(",")}|${b.points[1].join(",")}|${b.pinned.map((x) => (x === null ? "-" : x)).join("")}|${b.bar.join(",")}|${b.off.join(",")}`;
