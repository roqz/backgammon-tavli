import type { VariantId } from "@tavli/engine";

/**
 * Tunable parameters of the heuristic evaluation (units: pips). Defaults are hand-set;
 * `TUNED` holds per-variant improvements found by self-play (scripts/tune.ts).
 */
export interface Weights {
  /** Bonus per borne-off checker. */
  readonly offBonus: number;
  /** Race only: penalty per checker on the two deepest points. */
  readonly raceWastage: number;

  // Backgammon / Portes
  readonly pointHome: number;
  readonly pointHomeBest: number;
  readonly pointBar: number;
  readonly pointOuter: number;
  readonly anchor: number;
  readonly pointOther: number;
  readonly stack: number;
  readonly blotScale: number;
  readonly blotTempo: number;
  readonly prime: number;
  readonly barBase: number;
  readonly barPerPoint: number;

  // Plakoto
  readonly pinnedBase: number;
  readonly pinnedPerPip: number;
  readonly pinPointHome: number;
  readonly pinPointOuter: number;
  readonly pinPointOther: number;
  readonly pinStack: number;
  readonly manaRisk: number;
  readonly pinRiskBase: number;
  readonly pinRiskPerPip: number;
  readonly pinPrime: number;

  // Fevga
  readonly blockHome: number;
  readonly blockOther: number;
  readonly fevStack: number;
  readonly fevPrime: number;
  readonly startPenalty: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  offBonus: 0.5,
  raceWastage: 0.3,

  pointHome: 3.5,
  pointHomeBest: 4.5,
  pointBar: 3,
  pointOuter: 1.5,
  anchor: 2.5,
  pointOther: 1,
  stack: 0.4,
  blotScale: 1,
  blotTempo: 8,
  prime: 1.5,
  barBase: 4,
  barPerPoint: 2.5,

  pinnedBase: 14,
  pinnedPerPip: 0.8,
  pinPointHome: 3,
  pinPointOuter: 2,
  pinPointOther: 1.5,
  pinStack: 0.3,
  manaRisk: 80,
  pinRiskBase: 12,
  pinRiskPerPip: 0.6,
  pinPrime: 1.2,

  blockHome: 2,
  blockOther: 1.2,
  fevStack: 0.3,
  fevPrime: 1.2,
  startPenalty: 0.6,
};

/** Which weights matter for a variant (used by the tuner). */
const HIT_KEYS: readonly (keyof Weights)[] = [
  "offBonus",
  "raceWastage",
  "pointHome",
  "pointHomeBest",
  "pointBar",
  "pointOuter",
  "anchor",
  "pointOther",
  "stack",
  "blotScale",
  "blotTempo",
  "prime",
  "barBase",
  "barPerPoint",
];

export const RELEVANT_WEIGHTS: Record<VariantId, readonly (keyof Weights)[]> = {
  backgammon: HIT_KEYS,
  portes: HIT_KEYS,
  plakoto: [
    "offBonus",
    "raceWastage",
    "pinnedBase",
    "pinnedPerPip",
    "pinPointHome",
    "pinPointOuter",
    "pinPointOther",
    "pinStack",
    "manaRisk",
    "pinRiskBase",
    "pinRiskPerPip",
    "pinPrime",
  ],
  fevga: ["offBonus", "raceWastage", "blockHome", "blockOther", "fevStack", "fevPrime", "startPenalty"],
};

/** Self-play tuned overrides per variant. */
export const TUNED: Partial<Record<VariantId, Partial<Weights>>> = {};

const cache = new Map<VariantId, Weights>();

export const weightsFor = (variant: VariantId): Weights => {
  let w = cache.get(variant);
  if (!w) {
    w = { ...DEFAULT_WEIGHTS, ...TUNED[variant] };
    cache.set(variant, w);
  }
  return w;
};
