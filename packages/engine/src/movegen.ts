import { allHome, boardKey, canLandOn, canMoveFrom, cloneBoard, HOME_START, POINTS } from "./board";
import type { Board, Move, PlayedMove, Player } from "./types";
import { opponent } from "./types";
import type { VariantRules } from "./variants";

/** Apply a single move without legality checks. Returns the new board and whether a blot was hit/pinned. */
export const applyMoveUnchecked = (
  rules: VariantRules,
  board: Board,
  p: Player,
  move: Move,
): { board: Board; hit: boolean } => {
  const b = cloneBoard(board);
  const opp = opponent(p);
  if (move.from === "bar") {
    b.bar[p]--;
  } else {
    b.points[p][move.from]!--;
    // Leaving a point where we pinned an opponent releases the pinned checker.
    if (b.pinned[move.from] === opp && b.points[p][move.from] === 0) b.pinned[move.from] = null;
  }
  let hit = false;
  if (move.to === "off") {
    b.off[p]++;
  } else {
    const to = move.to;
    const oppCount = b.points[opp][to]!;
    if (rules.blots === "hit" && oppCount === 1) {
      b.points[opp][to] = 0;
      b.bar[opp]++;
      hit = true;
    } else if (rules.blots === "pin" && oppCount === 1 && b.pinned[to] === null && b.points[p][to] === 0) {
      b.pinned[to] = opp;
      hit = true;
    }
    b.points[p][to]!++;
  }
  return { board: b, hit };
};

export type GameEnd = "bear-off" | "mana" | null;

/**
 * Whether a just-applied move ends the game: the mover has no checkers left, or (Plakoto)
 * the opponent's last checker on its starting point got pinned.
 */
export const gameEndAfterMove = (
  rules: VariantRules,
  after: Board,
  p: Player,
  move: Move,
  hit: boolean,
): GameEnd => {
  if (after.bar[p] === 0 && after.points[p].every((n) => n === 0)) return "bear-off";
  const opp = opponent(p);
  if (rules.manaRule && hit && move.to === rules.paths[opp][0] && after.points[opp][move.to] === 1) {
    return "mana";
  }
  return null;
};

/** Fevga: would this position contain a forbidden six-point prime? */
const violatesFevgaPrime = (rules: VariantRules, b: Board, p: Player): boolean => {
  const opp = opponent(p);
  const q = rules.paths[opp];
  for (let j = 0; j + 6 <= POINTS; j++) {
    let block = true;
    for (let i = j; i < j + 6; i++) {
      if (b.points[p][q[i]!] === 0) {
        block = false;
        break;
      }
    }
    if (!block) continue;
    let behind = 0;
    let ahead = b.off[opp];
    for (let i = 0; i < j; i++) behind += b.points[opp][q[i]!]!;
    for (let i = j + 6; i < POINTS; i++) ahead += b.points[opp][q[i]!]!;
    if (behind > 0 && ahead === 0) return true;
  }
  return false;
};

/** Fevga: while the first checker has not passed the opponent's start, only it may move. */
const applyFevgaStartRule = (rules: VariantRules, b: Board, p: Player, moves: Move[]): Move[] => {
  const path = rules.paths[p];
  if (b.points[p][path[0]!] !== 14 || b.off[p] > 0) return moves;
  const oppStartIdx = path.indexOf(rules.paths[opponent(p)][0]!);
  let runner = -1;
  for (let k = 1; k < POINTS; k++) if (b.points[p][path[k]!]! > 0) runner = k;
  if (runner < 0 || runner > oppStartIdx) return moves;
  const restricted = moves.filter((m) => m.from === path[runner]);
  // If the runner is blocked, other checkers may move (house-rule friendly fallback).
  return restricted.length > 0 ? restricted : moves;
};

/** All legal single moves for one die value, ignoring the "use as many dice as possible" rules. */
export const singleMoves = (rules: VariantRules, b: Board, p: Player, die: number): Move[] => {
  const path = rules.paths[p];
  let moves: Move[] = [];
  if (b.bar[p] > 0) {
    const to = path[die - 1]!;
    if (canLandOn(rules, b, p, to)) moves.push({ from: "bar", to, die });
    return moves;
  }
  const home = allHome(rules, b, p);
  for (let k = 0; k < POINTS; k++) {
    const from = path[k]!;
    if (!canMoveFrom(b, p, from)) continue;
    const t = k + die;
    if (t < POINTS) {
      const to = path[t]!;
      if (canLandOn(rules, b, p, to)) moves.push({ from, to, die });
    } else if (home) {
      if (t === POINTS) {
        moves.push({ from, to: "off", die });
      } else {
        // Bearing off with a higher die is only allowed from the rearmost point.
        let behind = false;
        for (let j = HOME_START; j < k; j++) {
          if (b.points[p][path[j]!]! > 0) {
            behind = true;
            break;
          }
        }
        if (!behind) moves.push({ from, to: "off", die });
      }
    }
  }
  if (rules.fevgaStartRule) moves = applyFevgaStartRule(rules, b, p, moves);
  if (rules.fevgaPrimeRule) {
    moves = moves.filter((m) => !violatesFevgaPrime(rules, applyMoveUnchecked(rules, b, p, m).board, p));
  }
  return moves;
};

const removeOne = (dice: readonly number[], v: number): number[] => {
  const out = dice.slice();
  out.splice(out.indexOf(v), 1);
  return out;
};

const uniqueDice = (dice: readonly number[]): number[] => [...new Set(dice)];

const MAX_CACHE_ENTRIES = 100_000;

export interface TurnOption {
  readonly moves: readonly PlayedMove[];
  readonly board: Board;
  /** Set when the turn ends the game. */
  readonly end: GameEnd;
}

/**
 * Move generator for one player and one variant. Caches search results so that repeated
 * queries during a turn (UI highlighting, bots) stay cheap.
 */
export class MoveGenerator {
  private readonly depthCache = new Map<string, number>();

  constructor(
    readonly rules: VariantRules,
    readonly player: Player,
  ) {}

  /** Maximum number of dice playable from this position with the remaining dice. */
  maxPlayable(b: Board, dice: readonly number[]): number {
    if (dice.length === 0) return 0;
    const key = `${boardKey(b)}#${dice.join("")}`;
    const cached = this.depthCache.get(key);
    if (cached !== undefined) return cached;
    let best = 0;
    for (const v of uniqueDice(dice)) {
      const rest = removeOne(dice, v);
      for (const m of singleMoves(this.rules, b, this.player, v)) {
        best = Math.max(best, this.depthAfter(b, m, rest));
        if (best === dice.length) break;
      }
      if (best === dice.length) break;
    }
    if (this.depthCache.size >= MAX_CACHE_ENTRIES) this.depthCache.clear();
    this.depthCache.set(key, best);
    return best;
  }

  /** Dice used by playing `m` and then as many of `rest` as possible. A game-ending move uses all dice. */
  private depthAfter(b: Board, m: Move, rest: readonly number[]): number {
    const { board: next, hit } = applyMoveUnchecked(this.rules, b, this.player, m);
    if (gameEndAfterMove(this.rules, next, this.player, m, hit)) return 1 + rest.length;
    return 1 + this.maxPlayable(next, rest);
  }

  /**
   * Legal next single moves, honouring the compulsory-move rules:
   * - as many dice as possible must be played;
   * - if only one of two different dice can be played, the higher one must be played if possible.
   */
  legalMoves(b: Board, dice: readonly number[]): Move[] {
    const total = this.maxPlayable(b, dice);
    if (total === 0) return [];
    const values = uniqueDice(dice);
    let candidates: Move[] = [];
    for (const v of values) {
      const rest = removeOne(dice, v);
      for (const m of singleMoves(this.rules, b, this.player, v)) {
        if (this.depthAfter(b, m, rest) === total) candidates.push(m);
      }
    }
    if (total === 1 && dice.length === 2 && values.length === 2) {
      const high = Math.max(...values);
      const highMoves = candidates.filter((m) => m.die === high);
      if (highMoves.length > 0) candidates = highMoves;
    }
    return candidates;
  }

  /** All distinct end-of-turn positions reachable with these dice (for bots and analysis). */
  turnOptions(b: Board, dice: readonly number[]): TurnOption[] {
    const results = new Map<string, TurnOption>();
    const visited = new Set<string>();
    const record = (board: Board, seq: PlayedMove[], end: GameEnd) => {
      const bk = boardKey(board);
      if (!results.has(bk)) results.set(bk, { moves: seq, board, end });
    };
    const walk = (board: Board, rest: readonly number[], seq: PlayedMove[]) => {
      const key = `${boardKey(board)}#${[...rest].sort().join("")}`;
      if (visited.has(key)) return;
      visited.add(key);
      const moves = this.legalMoves(board, rest);
      if (moves.length === 0) return record(board, seq, null);
      for (const m of moves) {
        const { board: next, hit } = applyMoveUnchecked(this.rules, board, this.player, m);
        const nextSeq = [...seq, { ...m, hit }];
        const end = gameEndAfterMove(this.rules, next, this.player, m, hit);
        if (end) record(next, nextSeq, end);
        else walk(next, removeOne(rest, m.die), nextSeq);
      }
    };
    walk(b, dice, []);
    return [...results.values()];
  }
}

/** Expand a roll into the dice values to play (doubles are played four times). */
export const diceToPlay = (d1: number, d2: number): number[] => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

export const sameMove = (a: Move, b: Move): boolean => a.from === b.from && a.to === b.to && a.die === b.die;
