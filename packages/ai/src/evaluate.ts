import {
  type Board,
  getVariant,
  opponent,
  type Player,
  pipCount,
  type VariantId,
  type VariantRules,
} from "@tavli/engine";
import { DEFAULT_WEIGHTS, type Weights, weightsFor } from "./weights";

/**
 * Heuristic position evaluation in "pip-like" units from `p`'s point of view.
 * `mover` is the player who has just moved: only their blots are exposed, because only
 * the other side rolls next. The result is antisymmetric:
 * evaluate(b, p, m) === -evaluate(b, opponent(p), m), which keeps the expectimax search consistent. Each variant gets its own feature set:
 * - Backgammon / Portes: race, blot exposure, made points, primes, anchors, bar
 * - Plakoto: race, pinned checkers, pin exposure (incl. losing the "mana"), blocks
 * - Fevga: race, blocking points and walls in front of the opponent
 */
export const evaluate = (
  variant: VariantId,
  b: Board,
  p: Player,
  mover: Player = p,
  w: Weights = weightsFor(variant),
): number => {
  const rules = getVariant(variant);
  const ctx = new Ctx(rules, b, mover, w);
  return side(ctx, p) - side(ctx, opponent(p));
};

/** Probability (in 36ths) of hitting a single blot at distance d with direct and indirect shots. */
const SHOTS = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1];
const PRIME_BONUS = [0, 0, 1, 3, 6, 12, 20, 22];

/** Board viewed through each player's path (index 0 = start, 23 = last point). */
class Ctx {
  readonly own: [number[], number[]];
  readonly pins: [boolean[], boolean[]]; // own[p][k] contains a pinned checker of p
  readonly pips: [number, number];
  readonly contact: boolean;

  constructor(
    readonly rules: VariantRules,
    readonly b: Board,
    /** The player who has just moved (the opponent is on roll). */
    readonly mover: Player,
    readonly w: Weights,
  ) {
    const view = (p: Player) => rules.paths[p].map((abs) => b.points[p][abs]!);
    const pinView = (p: Player) => rules.paths[p].map((abs) => b.pinned[abs] === p);
    this.own = [view(0), view(1)];
    this.pins = [pinView(0), pinView(1)];
    this.pips = [pipCount(rules, b, 0), pipCount(rules, b, 1)];
    this.contact = this.computeContact();
  }

  /** Path index of an absolute point for player p. */
  idx(p: Player, abs: number): number {
    return this.rules.paths[p].indexOf(abs);
  }

  /** Opponent checkers in p's path coordinates (opposite directions only), bar mapped to 24. */
  oppInMyCoords(p: Player): number[] {
    const o = opponent(p);
    const out = new Array<number>(25).fill(0);
    for (let k = 0; k < 24; k++) out[k] = this.b.points[o][this.rules.paths[p][k]!]!;
    out[24] = this.b.bar[o];
    return out;
  }

  private computeContact(): boolean {
    if (this.rules.blots === "none") {
      // Same direction: contact while a checker sits on a point an opposing checker still has to pass.
      for (const p of [0, 1] as Player[]) {
        const o = opponent(p);
        const oppRear = this.rearIndex(o);
        for (let abs = 0; abs < 24; abs++) {
          if (this.b.points[p][abs]! > 0 && this.idx(o, abs) > oppRear) return true;
        }
      }
      return false;
    }
    const opp = this.oppInMyCoords(0);
    const rear = this.b.bar[0] > 0 ? -1 : this.rearIndex(0);
    for (let k = rear + 1; k <= 24; k++) if (opp[k]! > 0) return true;
    return false;
  }

  rearIndex(p: Player): number {
    if (this.b.bar[p] > 0) return -1;
    const v = this.own[p];
    for (let k = 0; k < 24; k++) if (v[k]! > 0) return k;
    return 24;
  }
}

const shotChance = (distances: number[]): number => {
  let miss = 1;
  for (const d of distances) if (d >= 1 && d <= 24) miss *= 1 - SHOTS[d]! / 36;
  return 1 - miss;
};

/** Distances from opposing checkers (opposite direction) that can reach my point k. */
const shooters = (ctx: Ctx, p: Player, k: number): number[] => {
  const opp = ctx.oppInMyCoords(p);
  const out: number[] = [];
  for (let k2 = k + 1; k2 <= 24 && k2 - k <= 24; k2++) if (opp[k2]! > 0) out.push(k2 - k);
  return out;
};

const longestRun = (held: boolean[], from: number, to: number): { len: number; end: number } => {
  let best = { len: 0, end: -1 };
  let run = 0;
  for (let k = from; k <= to; k++) {
    run = held[k] ? run + 1 : 0;
    if (run > best.len) best = { len: run, end: k };
  }
  return best;
};

const side = (ctx: Ctx, p: Player): number => {
  const { b } = ctx;
  const { w } = ctx;
  const v = -ctx.pips[p] + b.off[p] * w.offBonus;
  if (!ctx.contact) {
    // Pure race: pips plus a little wastage on the deepest points.
    return v - w.raceWastage * (ctx.own[p][23]! + ctx.own[p][22]!);
  }
  switch (ctx.rules.blots) {
    case "hit":
      return v + hitFeatures(ctx, p);
    case "pin":
      return v + pinFeatures(ctx, p);
    case "none":
      return v + fevgaFeatures(ctx, p);
  }
};

const madePointValue = (w: Weights, k: number): number => {
  if (k >= 18) return k === 19 || k === 20 ? w.pointHomeBest : w.pointHome; // 5- and 4-point best
  if (k === 17) return w.pointBar;
  if (k >= 12) return w.pointOuter;
  if (k <= 5) return w.anchor; // anchor in opponent's home
  return w.pointOther;
};

const hitFeatures = (ctx: Ctx, p: Player): number => {
  const o = opponent(p);
  const mine = ctx.own[p];
  const oppHere = ctx.oppInMyCoords(p);
  const { w } = ctx;
  let v = 0;
  const made = mine.map((n) => n >= 2);
  for (let k = 0; k < 24; k++) {
    const n = mine[k]!;
    if (n >= 2) v += madePointValue(w, k);
    if (n > 3) v -= w.stack * (n - 3);
    if (n === 1 && p === ctx.mover) {
      const risk = shotChance(shooters(ctx, p, k));
      // Being hit costs the pips travelled plus tempo.
      v -= w.blotScale * risk * (k + 1 + w.blotTempo);
    }
  }
  // Prime in front of opposing checkers that still have to pass.
  const run = longestRun(made, 0, 23);
  if (run.len >= 2) {
    let trapped = 0;
    for (let k2 = run.end + 1; k2 <= 24; k2++) trapped += oppHere[k2]!;
    if (trapped > 0) v += PRIME_BONUS[Math.min(run.len, 7)]! * w.prime;
  }
  // Own checkers on the bar against the opponent's home board (= my path 0..5).
  const oppHomeMade = ctx.own[o].slice(18).filter((n) => n >= 2).length;
  v -= ctx.b.bar[p] * (w.barBase + w.barPerPoint * oppHomeMade);
  return v;
};

const pinFeatures = (ctx: Ctx, p: Player): number => {
  const mine = ctx.own[p];
  const pinned = ctx.pins[p];
  const { w } = ctx;
  let v = 0;
  const held: boolean[] = [];
  for (let k = 0; k < 24; k++) {
    const n = mine[k]!;
    const isPinned = pinned[k]!;
    held.push(n >= 2 && !isPinned);
    if (isPinned) {
      v -= w.pinnedBase + (24 - k) * w.pinnedPerPip; // a trapped checker far from home is a disaster
      continue;
    }
    if (n >= 2) v += k >= 18 ? w.pinPointHome : k >= 12 ? w.pinPointOuter : w.pinPointOther;
    if (n > 4 && k > 0) v -= w.pinStack * (n - 4);
    if (n === 1 && p === ctx.mover) {
      const risk = shotChance(shooters(ctx, p, k));
      // Last checker on the starting point: being pinned there loses a double game (mana).
      v -=
        k === 0 && ctx.rules.manaRule
          ? risk * w.manaRisk
          : risk * (w.pinRiskBase + (24 - k) * w.pinRiskPerPip);
    }
  }
  const run = longestRun(held, 0, 23);
  if (run.len >= 2) v += PRIME_BONUS[Math.min(run.len, 7)]! * w.pinPrime;
  return v;
};

const fevgaFeatures = (ctx: Ctx, p: Player): number => {
  const o = opponent(p);
  const { rules, w } = ctx;
  const mine = ctx.own[p];
  // Opponent's rearmost path index: points beyond it still block opposing checkers.
  const oppRear = ctx.rearIndex(o);
  let v = 0;
  const heldOnOppPath: boolean[] = new Array<boolean>(24).fill(false);
  for (let k = 0; k < 24; k++) {
    const n = mine[k]!;
    if (n === 0) continue;
    const abs = rules.paths[p][k]!;
    const j = ctx.idx(o, abs); // where this point lies on the opponent's path
    if (j > oppRear && j < 24) {
      heldOnOppPath[j] = true;
      v += j >= 12 && j < 18 ? w.blockHome : w.blockOther; // blocking the way home hurts most
    }
    if (n > 3 && k > 0) v -= w.fevStack * (n - 3);
  }
  const run = longestRun(heldOnOppPath, 0, 23);
  if (run.len >= 2) v += PRIME_BONUS[Math.min(run.len, 6)]! * w.fevPrime;
  // Checkers still on the start point are slow to develop.
  v -= Math.max(0, mine[0]! - 10) * w.startPenalty;
  return v;
};

/** Normal CDF approximation (Abramowitz-Stegun). */
const phi = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
};

/**
 * Estimated probability that `p`, who is on roll, wins the game.
 * Races use a normal approximation of the number of rolls needed; contact positions map the
 * heuristic evaluation through a logistic curve.
 */
export const winProbability = (variant: VariantId, b: Board, p: Player): number =>
  onRollWins(new Ctx(getVariant(variant), b, opponent(p), weightsFor(variant)), p);

/** Win chance of `p`, who is on roll (the context's mover must be the opponent). */
const onRollWins = (ctx: Ctx, p: Player): number => {
  const variant = ctx.rules.id;
  const o = opponent(p);
  if (!ctx.contact) {
    const mean = 8.17;
    const varPerRoll = 18.6;
    const myPips = ctx.pips[p] + 0.0001;
    const oppPips = ctx.pips[o] + 0.0001;
    // Rolls needed ~ pips / mean; their variance ~ (pips / mean) * varPerRoll / mean².
    const sd = Math.sqrt(((myPips + oppPips) / mean) * varPerRoll) / mean;
    return phi((oppPips / mean - myPips / mean + 0.5) / Math.max(sd, 0.3));
  }
  const e = side(ctx, p) - side(ctx, o) + ON_ROLL_BONUS[variant];
  return 1 / (1 + Math.exp(-e / CONTACT_SCALE[variant]));
};

export const isContact = (variant: VariantId, b: Board): boolean =>
  new Ctx(getVariant(variant), b, 0, DEFAULT_WEIGHTS).contact;

/**
 * Logistic calibration of evaluation -> win probability for contact positions, fitted on
 * medium-vs-medium self-play (see test/calibrate.bench-test.ts).
 */
const CONTACT_SCALE: Record<VariantId, number> = {
  backgammon: 24,
  portes: 28,
  plakoto: 58,
  fevga: 30,
  tavla: 28,
  narde: 30,
};
const ON_ROLL_BONUS: Record<VariantId, number> = {
  backgammon: 3,
  portes: 2,
  plakoto: -1,
  fevga: 4,
  tavla: 2,
  narde: 4,
};

/**
 * Probabilities of a position's results from `p`'s point of view: the win chance and, for
 * each side, how often its wins are gammons / backgammons (conditional on winning).
 */
export interface Outcomes {
  readonly win: number;
  readonly gammonWin: number;
  readonly backgammonWin: number;
  readonly gammonLoss: number;
  readonly backgammonLoss: number;
}

/** Result probabilities for `p` with `onRoll` to move next. */
export const outcomes = (
  variant: VariantId,
  b: Board,
  p: Player,
  onRoll: Player,
  w: Weights = weightsFor(variant),
): Outcomes => {
  const ctx = new Ctx(getVariant(variant), b, opponent(onRoll), w);
  const onRollWin = onRollWins(ctx, onRoll);
  const mine = gammonsFor(ctx, p);
  const theirs = gammonsFor(ctx, opponent(p));
  return {
    win: onRoll === p ? onRollWin : 1 - onRollWin,
    gammonWin: mine.gammon,
    backgammonWin: mine.backgammon,
    gammonLoss: theirs.gammon,
    backgammonLoss: theirs.backgammon,
  };
};

/**
 * Rough chance that `winner`, if they win, wins a gammon (and a backgammon): the loser still has
 * to bring every checker home and bear one off before the winner has borne off all of theirs.
 * Modelled as a race of those two pip counts.
 */
export const gammonChances = (
  variant: VariantId,
  b: Board,
  winner: Player,
): { gammon: number; backgammon: number } =>
  gammonsFor(new Ctx(getVariant(variant), b, winner, DEFAULT_WEIGHTS), winner);

/** Inputs of the gammon model: the race to get home (z-score) and how many checkers are still out. */
export const gammonFeatures = (
  variant: VariantId,
  b: Board,
  winner: Player,
): { z: number; outside: number; inHome: number } | null =>
  gammonInputs(new Ctx(getVariant(variant), b, winner, DEFAULT_WEIGHTS), winner);

const gammonInputs = (ctx: Ctx, winner: Player): { z: number; outside: number; inHome: number } | null => {
  const loser = opponent(winner);
  const b = ctx.b;
  if (b.off[loser] > 0) return null;
  const view = ctx.own[loser];
  // Pips the loser needs to get all checkers into the home board (path index 18+), plus one bear-off.
  let homePips = b.bar[loser] * 19;
  let outside = b.bar[loser];
  let inWinnersHome = b.bar[loser];
  for (let k = 0; k < 18; k++) {
    const n = view[k]!;
    homePips += n * (18 - k);
    outside += n;
    if (k < 6) inWinnersHome += n;
  }
  const needLoser = homePips + 4;
  const needWinner = ctx.pips[winner] + 2 * (15 - b.off[winner]) * 0.3;
  const mean = 8.17;
  const sd = Math.max(Math.sqrt(((needLoser + needWinner) / mean) * 18.6) / mean, 0.5);
  return { z: (needLoser - needWinner) / mean / sd, outside: outside / 15, inHome: inWinnersHome / 15 };
};

/**
 * Logistic gammon model per variant, P(gammon | win) = σ(a + b·z + c·outside), fitted on
 * medium-vs-medium self-play without cube (test/gammon.bench-test.ts, two seeds averaged; checked
 * on held-out games: predicted and actual gammon rates agree within a few percent per decile).
 */
const GAMMON_MODEL: Record<VariantId, { a: number; b: number; c: number }> = {
  backgammon: { a: -1.3, b: 0.58, c: 2.89 },
  portes: { a: -1.09, b: 0.62, c: 2.75 },
  plakoto: { a: -0.42, b: 0.53, c: 1.15 },
  fevga: { a: 0.36, b: 0.79, c: -0.2 },
  // not fitted separately: the closest variant
  tavla: { a: -1.09, b: 0.62, c: 2.75 },
  narde: { a: 0.36, b: 0.79, c: -0.2 },
};

const gammonsFor = (ctx: Ctx, winner: Player): { gammon: number; backgammon: number } => {
  const x = gammonInputs(ctx, winner);
  if (!x) return { gammon: 0, backgammon: 0 };
  const m = GAMMON_MODEL[ctx.rules.id];
  // All of the loser's checkers are home: it is a plain race of one bear-off against the
  // winner's whole bear-off, where the normal approximation is accurate (the logistic fit has
  // a small floor that would wrongly keep a gammon "possible").
  const gammon = x.outside === 0 ? phi(x.z) : 1 / (1 + Math.exp(-(m.a + m.b * x.z + m.c * x.outside)));
  const backgammon = ctx.rules.backgammons && x.inHome > 0 ? gammon * 0.25 : 0;
  return { gammon, backgammon };
};
