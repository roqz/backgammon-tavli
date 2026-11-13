import type { Player, VariantId } from "./types";

/**
 * How a checker interacts with a single opposing checker ("blot"):
 * - `hit`:  the blot is sent to the bar (Backgammon, Portes)
 * - `pin`:  the blot is trapped beneath the moving checker until released (Plakoto)
 * - `none`: any point occupied by the opponent is blocked (Fevga)
 */
export type BlotRule = "hit" | "pin" | "none";

/** Starting position in own point numbers (24 = start, 1 = last point before bearing off). */
export type OwnPointSetup = Readonly<Record<number, number>>;

export interface VariantRules {
  readonly id: VariantId;
  readonly name: string;
  readonly blots: BlotRule;
  /** Doubling cube available. */
  readonly cube: boolean;
  /** Winner of the opening roll plays the two opening dice (otherwise rolls again). */
  readonly openingRollPlayed: boolean;
  /** Loser with checkers on bar / in winner's home board loses a triple game. */
  readonly backgammons: boolean;
  /** Plakoto: pinning the opponent's last checker on its starting point wins a double game. */
  readonly manaRule: boolean;
  /** Fevga: first checker must pass the opponent's start before others may leave the start point. */
  readonly fevgaStartRule: boolean;
  /** Fevga, Narde: no prime of six consecutive points unless an opponent checker is already ahead of it. */
  readonly fevgaPrimeRule: boolean;
  /** Narde: one checker leaves the head per turn (two on a first roll of 3-3, 4-4 or 6-6). */
  readonly headRule: boolean;
  /** Tavla: a checker that hits in the own home board must stay there for the rest of the turn. */
  readonly noHitAndRunHome: boolean;
  /** Tavla: a die that can bear a checker off must be used to bear off (no wasting pips). */
  readonly noWasteBearOff: boolean;
  readonly setup: OwnPointSetup;
  /** The 24 absolute point indices a player travels, from start (index 0) to home (index 23). */
  readonly paths: readonly [readonly number[], readonly number[]];
}

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let i = from; i !== to + step; i += step) out.push(i);
  return out;
};

/** White travels 23 -> 0, black travels 0 -> 23 (opposite directions). */
const OPPOSITE_PATHS: readonly [readonly number[], readonly number[]] = [range(23, 0), range(0, 23)];

/** Fevga: both travel the same rotational direction, starting in diagonally opposite corners. */
const SAME_DIRECTION_PATHS: readonly [readonly number[], readonly number[]] = [
  range(23, 0),
  [...range(11, 0), ...range(23, 12)],
];

const BACKGAMMON_SETUP: OwnPointSetup = { 24: 2, 13: 5, 8: 3, 6: 5 };
const ALL_ON_START: OwnPointSetup = { 24: 15 };

export const VARIANTS: Readonly<Record<VariantId, VariantRules>> = {
  backgammon: {
    id: "backgammon",
    name: "Backgammon",
    blots: "hit",
    cube: true,
    openingRollPlayed: true,
    backgammons: true,
    manaRule: false,
    fevgaStartRule: false,
    fevgaPrimeRule: false,
    headRule: false,
    noHitAndRunHome: false,
    noWasteBearOff: false,
    setup: BACKGAMMON_SETUP,
    paths: OPPOSITE_PATHS,
  },
  portes: {
    id: "portes",
    name: "Portes",
    blots: "hit",
    cube: false,
    openingRollPlayed: false,
    backgammons: false,
    manaRule: false,
    fevgaStartRule: false,
    fevgaPrimeRule: false,
    headRule: false,
    noHitAndRunHome: false,
    noWasteBearOff: false,
    setup: BACKGAMMON_SETUP,
    paths: OPPOSITE_PATHS,
  },
  plakoto: {
    id: "plakoto",
    name: "Plakoto",
    blots: "pin",
    cube: false,
    openingRollPlayed: false,
    backgammons: false,
    manaRule: true,
    fevgaStartRule: false,
    fevgaPrimeRule: false,
    headRule: false,
    noHitAndRunHome: false,
    noWasteBearOff: false,
    setup: ALL_ON_START,
    paths: OPPOSITE_PATHS,
  },
  fevga: {
    id: "fevga",
    name: "Fevga",
    blots: "none",
    cube: false,
    openingRollPlayed: false,
    backgammons: false,
    manaRule: false,
    fevgaStartRule: true,
    fevgaPrimeRule: true,
    headRule: false,
    noHitAndRunHome: false,
    noWasteBearOff: false,
    setup: ALL_ON_START,
    paths: SAME_DIRECTION_PATHS,
  },
  tavla: {
    id: "tavla",
    name: "Tavla",
    blots: "hit",
    cube: false,
    openingRollPlayed: false,
    backgammons: false,
    manaRule: false,
    fevgaStartRule: false,
    fevgaPrimeRule: false,
    headRule: false,
    noHitAndRunHome: true,
    noWasteBearOff: true,
    setup: BACKGAMMON_SETUP,
    paths: OPPOSITE_PATHS,
  },
  narde: {
    id: "narde",
    name: "Narde",
    blots: "none",
    cube: false,
    openingRollPlayed: false,
    backgammons: false,
    manaRule: false,
    fevgaStartRule: false,
    fevgaPrimeRule: true,
    headRule: true,
    noHitAndRunHome: false,
    noWasteBearOff: false,
    setup: ALL_ON_START,
    paths: SAME_DIRECTION_PATHS,
  },
};

export const getVariant = (id: VariantId): VariantRules => VARIANTS[id];

/** Position of an absolute point on a player's path (0 = start, 23 = last point). */
export const pathIndex = (rules: VariantRules, player: Player, abs: number): number => {
  const idx = rules.paths[player].indexOf(abs);
  if (idx < 0) throw new Error(`Point ${abs} not on path of player ${player}`);
  return idx;
};

/** Own point number (24..1) of an absolute point, as used in notation. */
export const ownPoint = (rules: VariantRules, player: Player, abs: number): number =>
  24 - pathIndex(rules, player, abs);

/** Absolute index of a player's own point number (24..1). */
export const absFromOwnPoint = (rules: VariantRules, player: Player, own: number): number => {
  if (own < 1 || own > 24) throw new Error(`Invalid own point ${own}`);
  return rules.paths[player][24 - own]!;
};
