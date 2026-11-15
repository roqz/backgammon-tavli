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

/** "mana-draw": both mothers pinned (Plakoto), the game ends without points. */
export type GameEnd = "bear-off" | "mana" | "mana-draw" | null;

/**
 * Plakoto: the "mother" of `owner` – its last checker on its starting point – is pinned by the
 * other player.
 */
const motherPinned = (rules: VariantRules, b: Board, owner: Player): boolean => {
  const start = rules.paths[owner][0]!;
  return b.points[owner][start] === 1 && b.points[opponent(owner)][start]! > 0 && b.pinned[start] === owner;
};

/**
 * Whether a just-applied move ends the game: the mover has no checkers left, or (Plakoto) the
 * opponent's mother is pinned. The mother rule only applies while the mover has no checkers left
 * on its own starting point (until then its own mother is at risk too); with both mothers
 * pinned the game is a draw. Checked after every move, so a mother pinned earlier wins as soon
 * as the pinning player's last checker has left its start.
 */
export const gameEndAfterMove = (
  rules: VariantRules,
  after: Board,
  p: Player,
  _move: Move,
  _hit: boolean,
): GameEnd => {
  if (after.bar[p] === 0 && after.points[p].every((n) => n === 0)) return "bear-off";
  if (!rules.manaRule) return null;
  const opp = opponent(p);
  if (!motherPinned(rules, after, opp)) return null;
  if (motherPinned(rules, after, p)) return "mana-draw";
  return after.points[p][rules.paths[p][0]!] === 0 ? "mana" : null;
};

/**
 * Fevga: is this end-of-turn position forbidden for `p`? Two rules: no block over all six points
 * of one's own starting quarter, and no six-point prime with every opposing checker behind it.
 * Checked at the end of the turn: a prime may be passed through while moving.
 */
export const violatesFevgaPrime = (rules: VariantRules, b: Board, p: Player): boolean => {
  const own = rules.paths[p];
  let quarter = true;
  for (let k = 0; k < 6; k++) {
    if (b.points[p][own[k]!] === 0) {
      quarter = false;
      break;
    }
  }
  if (quarter) return true;
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

/**
 * Fevga: while the first checker has not passed the opponent's start, only it may move. If it is
 * blocked, no other checker may move instead (the roll is lost).
 */
const applyFevgaStartRule = (rules: VariantRules, b: Board, p: Player, moves: Move[]): Move[] => {
  const path = rules.paths[p];
  if (b.points[p][path[0]!] !== 14 || b.off[p] > 0) return moves;
  const oppStartIdx = path.indexOf(rules.paths[opponent(p)][0]!);
  let runner = -1;
  for (let k = 1; k < POINTS; k++) if (b.points[p][path[k]!]! > 0) runner = k;
  if (runner < 0 || runner > oppStartIdx) return moves;
  return moves.filter((m) => m.from === path[runner]);
};

/**
 * What the rest of a turn depends on beyond board and dice (variant rules that look at the
 * moves already played this turn).
 */
export interface TurnContext {
  /** Narde: checkers that may still leave the head (starting point) this turn. */
  readonly headLeft: number;
  /** Tavla: home-board points where a checker hit this turn; it must stay there. */
  readonly frozen: readonly number[];
}

const FREE: TurnContext = { headLeft: 99, frozen: [] };

/** Narde: first rolls on which a second checker may leave the head (one alone gets stuck). */
const TWO_FROM_HEAD = [3, 4, 6];

/**
 * Context at the start of a turn. A player's first turn is recognised by all checkers still
 * on the head (Narde has no hitting, so they never come back).
 */
export const initialContext = (
  rules: VariantRules,
  b: Board,
  p: Player,
  dice: readonly number[],
): TurnContext => {
  if (!rules.headRule) return FREE;
  const first = b.points[p][rules.paths[p][0]!] === 15;
  const double = dice.length === 4 && TWO_FROM_HEAD.includes(dice[0]!);
  return { headLeft: first && double ? 2 : 1, frozen: [] };
};

/** Context after a move of this turn. */
export const contextAfter = (
  rules: VariantRules,
  ctx: TurnContext,
  p: Player,
  m: Move,
  hit: boolean,
): TurnContext => {
  const fromHead = rules.headRule && m.from === rules.paths[p][0];
  const freeze = rules.noHitAndRunHome && hit && m.to !== "off" && rules.paths[p].indexOf(m.to) >= HOME_START;
  if (!fromHead && !freeze) return ctx;
  return {
    headLeft: fromHead ? ctx.headLeft - 1 : ctx.headLeft,
    frozen: freeze ? [...ctx.frozen, m.to as number] : ctx.frozen,
  };
};

const contextKey = (ctx: TurnContext) => (ctx === FREE ? "" : `|${ctx.headLeft}|${ctx.frozen.join(",")}`);

/** All legal single moves for one die value, ignoring the "use as many dice as possible" rules. */
export const singleMoves = (
  rules: VariantRules,
  b: Board,
  p: Player,
  die: number,
  ctx: TurnContext = FREE,
): Move[] => {
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
  if (rules.headRule && ctx.headLeft <= 0) moves = moves.filter((m) => m.from !== path[0]);
  // the hitting checker stays (unless another checker of ours has joined it)
  if (ctx.frozen.length > 0)
    moves = moves.filter((m) => m.from === "bar" || !ctx.frozen.includes(m.from) || b.points[p][m.from]! > 1);
  // no wasting pips: a die that can bear a checker off must do so
  if (rules.noWasteBearOff && moves.some((m) => m.to === "off")) moves = moves.filter((m) => m.to === "off");
  if (rules.fevgaStartRule) moves = applyFevgaStartRule(rules, b, p, moves);
  // (the Fevga prime rules look at the end of the turn: MoveGenerator)
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

  /** Context at the start of a turn with these dice. */
  start(b: Board, dice: readonly number[]): TurnContext {
    return initialContext(this.rules, b, this.player, dice);
  }

  /**
   * Fevga prime rules on: turns must end in an allowed position. Off when no allowed end exists
   * at all (a prime the opponent's move left behind that cannot be opened): then any end goes.
   */
  private endCheck = false;

  /** Whether the turn may end in this position. */
  private endAllowed(b: Board): boolean {
    return !this.endCheck || !violatesFevgaPrime(this.rules, b, this.player);
  }

  /**
   * Maximum number of dice playable from this position with the remaining dice, among the ways
   * that end the turn in an allowed position (-1: none does).
   */
  maxPlayable(b: Board, dice: readonly number[], ctx: TurnContext = this.start(b, dice)): number {
    if (this.rules.fevgaPrimeRule && !this.endCheck && dice.length > 0) {
      // decide once per turn start whether the end-of-turn check can be met at all
      this.endCheck = true;
      const depth = this.maxPlayable(b, dice, ctx);
      if (depth >= 0) return depth;
      this.endCheck = false;
      this.depthCache.clear();
      return this.maxPlayable(b, dice, ctx);
    }
    if (dice.length === 0) return this.endAllowed(b) ? 0 : -1;
    const key = `${boardKey(b)}#${dice.join("")}${contextKey(ctx)}${this.endCheck ? "!" : ""}`;
    const cached = this.depthCache.get(key);
    if (cached !== undefined) return cached;
    // stopping here counts only if no die can be played (the deeper ways win otherwise)
    let best = this.endAllowed(b) ? 0 : -1;
    for (const v of uniqueDice(dice)) {
      const rest = removeOne(dice, v);
      for (const m of singleMoves(this.rules, b, this.player, v, ctx)) {
        best = Math.max(best, this.depthAfter(b, m, rest, ctx));
        if (best === dice.length) break;
      }
      if (best === dice.length) break;
    }
    if (this.depthCache.size >= MAX_CACHE_ENTRIES) this.depthCache.clear();
    this.depthCache.set(key, best);
    return best;
  }

  /** Dice used by playing `m` and then as many of `rest` as possible. A game-ending move uses all dice. */
  private depthAfter(b: Board, m: Move, rest: readonly number[], ctx: TurnContext): number {
    const { board: next, hit } = applyMoveUnchecked(this.rules, b, this.player, m);
    if (gameEndAfterMove(this.rules, next, this.player, m, hit)) return 1 + rest.length;
    const deeper = this.maxPlayable(next, rest, contextAfter(this.rules, ctx, this.player, m, hit));
    return deeper < 0 ? -1 : 1 + deeper;
  }

  /**
   * Legal next single moves, honouring the compulsory-move rules:
   * - as many dice as possible must be played;
   * - if only one of two different dice can be played, the higher one must be played if possible.
   */
  legalMoves(b: Board, dice: readonly number[], ctx: TurnContext = this.start(b, dice)): Move[] {
    this.endCheck = false;
    const total = this.maxPlayable(b, dice, ctx);
    if (total <= 0) return [];
    const values = uniqueDice(dice);
    let candidates: Move[] = [];
    for (const v of values) {
      const rest = removeOne(dice, v);
      for (const m of singleMoves(this.rules, b, this.player, v, ctx)) {
        if (this.depthAfter(b, m, rest, ctx) === total) candidates.push(m);
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
  turnOptions(b: Board, dice: readonly number[], context: TurnContext = this.start(b, dice)): TurnOption[] {
    const results = new Map<string, TurnOption>();
    const visited = new Set<string>();
    const record = (board: Board, seq: PlayedMove[], end: GameEnd) => {
      const bk = boardKey(board);
      if (!results.has(bk)) results.set(bk, { moves: seq, board, end });
    };
    const walk = (board: Board, rest: readonly number[], seq: PlayedMove[], ctx: TurnContext) => {
      const key = `${boardKey(board)}#${[...rest].sort().join("")}${contextKey(ctx)}`;
      if (visited.has(key)) return;
      visited.add(key);
      const moves = this.legalMoves(board, rest, ctx);
      if (moves.length === 0) return record(board, seq, null);
      for (const m of moves) {
        const { board: next, hit } = applyMoveUnchecked(this.rules, board, this.player, m);
        const nextSeq = [...seq, { ...m, hit }];
        const end = gameEndAfterMove(this.rules, next, this.player, m, hit);
        if (end) record(next, nextSeq, end);
        else walk(next, removeOne(rest, m.die), nextSeq, contextAfter(this.rules, ctx, this.player, m, hit));
      }
    };
    walk(b, dice, [], context);
    return [...results.values()];
  }
}

/** Expand a roll into the dice values to play (doubles are played four times). */
export const diceToPlay = (d1: number, d2: number): number[] => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

export const sameMove = (a: Move, b: Move): boolean => a.from === b.from && a.to === b.to && a.die === b.die;
