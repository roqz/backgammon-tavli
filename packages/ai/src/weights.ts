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

/**
 * Variants that share the evaluation of another one: Tavla plays like Portes (hitting, no cube),
 * Narde like Fevga (blocking, same direction, all checkers start on one point).
 */
export const MODEL_OF: Record<VariantId, VariantId> = {
  backgammon: "backgammon",
  portes: "portes",
  plakoto: "plakoto",
  fevga: "fevga",
  tavla: "portes",
  narde: "fevga",
  hypergammon: "backgammon",
};

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
  tavla: HIT_KEYS,
  hypergammon: HIT_KEYS,
  narde: ["offBonus", "raceWastage", "blockHome", "blockOther", "fevStack", "fevPrime", "startPenalty"],
};

/** Self-play tuned overrides per variant. */
export const TUNED: Partial<Record<VariantId, Partial<Weights>>> = {
  fevga: {
    offBonus: 0.439,
    raceWastage: 0.108,
    blockHome: 1.428,
    blockOther: 1.538,
    fevStack: 0.355,
    fevPrime: 1.753,
    startPenalty: 0.372,
  },
  plakoto: {
    offBonus: 0.505,
    raceWastage: 0.027,
    pinnedBase: 22.876,
    pinnedPerPip: 1.646,
    pinPointHome: 0.98,
    pinPointOuter: 2.151,
    pinPointOther: 1.587,
    pinStack: 0.018,
    manaRisk: 53.476,
    pinRiskBase: 6.831,
    pinRiskPerPip: 0.528,
    pinPrime: 0.664,
  },
  portes: {
    offBonus: 0.45,
    raceWastage: 0.725,
    pointHome: 3.471,
    pointHomeBest: 5.434,
    pointBar: 2.021,
    pointOuter: 1.767,
    anchor: 1.261,
    pointOther: 2.204,
    stack: 0.122,
    blotScale: 1.313,
    blotTempo: 1.299,
    prime: 2.881,
    barBase: 1.999,
    barPerPoint: 1.99,
  },
  backgammon: {
    offBonus: 0.791,
    raceWastage: 0.289,
    pointHome: 4.039,
    pointHomeBest: 4.246,
    pointBar: 2.676,
    pointOuter: 1.419,
    anchor: 1.356,
    pointOther: 2.868,
    stack: 0.271,
    blotScale: 0.982,
    blotTempo: 3.181,
    prime: 2.096,
    barBase: 2.805,
    barPerPoint: 0.844,
  },
};

const cache = new Map<VariantId, Weights>();

export const weightsFor = (variant: VariantId): Weights => {
  let w = cache.get(variant);
  if (!w) {
    w = { ...DEFAULT_WEIGHTS, ...(TUNED[variant] ?? TUNED[MODEL_OF[variant]]) };
    cache.set(variant, w);
  }
  return w;
};
