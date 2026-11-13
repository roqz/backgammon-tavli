import {
  type Board,
  bearOffLevel,
  boardKey,
  canDouble,
  diceToPlay,
  type GameState,
  type Move,
  maxResultLevel,
  moveGenerator,
  opponent,
  type PlayedMove,
  type Player,
  type Rng,
  type TurnOption,
  turnOptions,
} from "@tavli/engine";
import { expectedUtility, gammonsCount, type MatchContext, MONEY, type Utility, utilityFor } from "./equity";
import { evaluate, isContact, type Outcomes, outcomes } from "./evaluate";
import { type Net, netFor, netOutcomes } from "./nn";
import { type Weights, weightsFor } from "./weights";

export type { MatchContext } from "./equity";

/** easy, medium and hard use the heuristic evaluation; expert the neural network (where trained). */
export type BotLevel = "easy" | "medium" | "hard" | "expert";

export const BOT_LEVELS: readonly BotLevel[] = ["easy", "medium", "hard", "expert"];

/** The network a level plays with (expert only; null = heuristic). */
const levelNet = (s: GameState, level: BotLevel): Net | null =>
  level === "expert" ? netFor(s.variant) : null;

/** Result chances for `p` with `onRoll` next, from the network when given, else the heuristic. */
const positionOutcomes = (
  s: GameState,
  board: Board,
  p: Player,
  onRoll: Player,
  net: Net | null,
): Outcomes => (net ? netOutcomes(net, s.variant, board, p, onRoll) : outcomes(s.variant, board, p, onRoll));

/** The 21 distinct rolls with their probability weights (doubles 1/36, others 2/36). */
const ROLLS: readonly { dice: number[]; weight: number }[] = (() => {
  const out: { dice: number[]; weight: number }[] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) out.push({ dice: diceToPlay(a, b), weight: (a === b ? 1 : 2) / 36 });
  }
  return out;
})();

const HARD_CANDIDATES = 6;

export interface ChooseOptions {
  /** Value gammons and backgammons (default true); false = play for the win only. */
  readonly gammons?: boolean;
}

/**
 * Values positions for player `p` in points (money equity) from the evaluation's win, gammon
 * and backgammon chances. The match score is deliberately not used for checker play: weighting
 * moves by the match equity table (fully, or only for dead gammons) measured 2–4 % fewer match
 * wins in self-play (test/equity.bench-test.ts); the table is used for cube decisions instead.
 */
class Valuer {
  private readonly cube: number;
  private readonly gammons: boolean;

  constructor(
    private readonly s: GameState,
    private readonly p: Player,
    private readonly w: Weights,
    opts: ChooseOptions,
    private readonly net: Net | null = null,
  ) {
    this.cube = s.cube.value;
    this.gammons = (opts.gammons ?? true) && gammonsCount(s);
  }

  /** Position after a move, with `onRoll` to move next. */
  position(board: GameState["board"], onRoll: Player): number {
    const o: Outcomes = this.net
      ? netOutcomes(this.net, this.s.variant, board, this.p, onRoll)
      : outcomes(this.s.variant, board, this.p, onRoll, this.w);
    return expectedUtility(o, this.cube, POINTS, this.gammons);
  }

  /** The game ended with `winner` bearing off (or by mana) after `option`. */
  end(option: TurnOption, winner: Player): number {
    const level = option.end === "mana" ? 2 : bearOffLevel({ ...this.s, board: option.board }, winner);
    const points = (this.gammons ? level : 1) * this.cube;
    return winner === this.p ? points : -points;
  }
}

const POINTS: Utility = (k) => k;

const gaussian = (rng: Rng): number => {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

/** Expected value for `p` after `option`, assuming the opponent answers each roll with the reply worst for `p`. */
const twoPly = (s: GameState, p: Player, option: TurnOption, v: Valuer): number => {
  if (option.end) return v.end(option, p);
  const opp = opponent(p);
  const gen = moveGenerator(s.variant, opp);
  let expected = 0;
  for (const roll of ROLLS) {
    const replies = gen.turnOptions(option.board, roll.dice);
    let worst = replies.length === 0 ? v.position(option.board, p) : Number.POSITIVE_INFINITY;
    for (const r of replies) {
      const value = r.end ? v.end(r, opp) : v.position(r.board, p);
      if (value < worst) worst = value;
    }
    expected += roll.weight * worst;
  }
  return expected;
};

/**
 * Chooses the moves for the rest of the current turn (`state.phase` must be `moving`).
 * - easy:   1-ply heuristic with noise and occasional random moves
 * - medium: best 1-ply expected points (gammons included)
 * - hard:   2-ply expectimax over the best candidates
 */
export const chooseMoves = (
  s: GameState,
  level: BotLevel,
  rng: Rng,
  w: Weights = weightsFor(s.variant),
  opts: ChooseOptions = {},
): Move[] => {
  if (s.phase !== "moving") return [];
  const options = turnOptions(s);
  const best = chooseOption(s, options, level, rng, w, opts);
  return best ? best.moves.map(({ from, to, die }) => ({ from, to, die })) : [];
};

const chooseOption = (
  s: GameState,
  options: readonly TurnOption[],
  level: BotLevel,
  rng: Rng,
  w: Weights,
  opts: ChooseOptions,
): TurnOption | null => {
  const p = s.turn;
  if (options.length === 0) return null;
  if (options.length === 1) return options[0]!;

  if (level === "easy") {
    if (rng() < 0.25) return options[Math.floor(rng() * options.length)]!;
    let best = options[0]!;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const o of options) {
      const value = (o.end ? 10_000 : evaluate(s.variant, o.board, p, p, w)) + gaussian(rng) * 10;
      if (value > bestValue) {
        bestValue = value;
        best = o;
      }
    }
    return best;
  }

  const v = new Valuer(s, p, w, opts, levelNet(s, level));
  const opp = opponent(p);
  const scored = options.map((o) => ({ o, v: o.end ? v.end(o, p) : v.position(o.board, opp) }));
  scored.sort((a, b) => b.v - a.v);
  if ((level !== "hard" && level !== "expert") || scored[0]!.o.end) return scored[0]!.o;

  let best = scored[0]!;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const c of scored.slice(0, HARD_CANDIDATES)) {
    const value = twoPly(s, p, c.o, v);
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  }
  return best.o;
};

export interface TurnAnalysis {
  /** Distinct positions the player could reach with this roll. */
  readonly choices: number;
  /** The player chose the same position as the reference bot. */
  readonly agrees: boolean;
  /** Equity lost against the best 1-ply option, in points (0 = best). */
  readonly loss: number;
}

/**
 * Compares a played turn with the bot (fair-play analysis): `s` is the state after the roll,
 * `played` the board after the player's moves. Returns null for forced turns (one option).
 */
export const analyseTurn = (
  s: GameState,
  played: Board,
  reference: BotLevel = "hard",
): TurnAnalysis | null => {
  if (s.phase !== "moving") return null;
  const options = turnOptions(s);
  if (options.length < 2) return null;
  const key = boardKey(played);
  const w = weightsFor(s.variant);
  const v = new Valuer(s, s.turn, w, {});
  const opp = opponent(s.turn);
  let best = Number.NEGATIVE_INFINITY;
  let chosen: number | null = null;
  for (const o of options) {
    const value = o.end ? v.end(o, s.turn) : v.position(o.board, opp);
    if (value > best) best = value;
    if (boardKey(o.board) === key) chosen = value;
  }
  if (chosen === null) return null;
  const bot = chooseOption(s, options, reference, () => 0.5, w, {});
  return {
    choices: options.length,
    agrees: bot !== null && boardKey(bot.board) === key,
    loss: best - chosen,
  };
};

/** A turn option with its 1-ply value for the player on turn (points per game). */
export interface RankedOption {
  readonly moves: readonly PlayedMove[];
  readonly board: Board;
  readonly value: number;
}

/**
 * All distinct options of the roll, best first, by the same 1-ply evaluation the reviews use
 * (for puzzles: a clear best move is one well ahead of the second).
 */
export const rankTurnOptions = (s: GameState): RankedOption[] => {
  if (s.phase !== "moving") return [];
  const options = turnOptions(s);
  const w = weightsFor(s.variant);
  const v = new Valuer(s, s.turn, w, {}, netFor(s.variant));
  const opp = opponent(s.turn);
  return options
    .map((o) => ({
      moves: o.moves,
      board: o.board,
      value: o.end ? v.end(o, s.turn) : v.position(o.board, opp),
    }))
    .sort((a, b) => b.value - a.value);
};

/** A played turn compared with the best option (for players reviewing their games). */
export interface TurnReview extends TurnAnalysis {
  /** The best option by the same 1-ply evaluation the loss is measured against. */
  readonly best: readonly PlayedMove[];
}

/**
 * Like {@link analyseTurn}, but also returns the best option's moves, so a player can see
 * what would have been better. Null for forced turns.
 */
export const reviewTurn = (s: GameState, played: Board): TurnReview | null => {
  if (s.phase !== "moving") return null;
  const options = turnOptions(s);
  if (options.length < 2) return null;
  const key = boardKey(played);
  const w = weightsFor(s.variant);
  const v = new Valuer(s, s.turn, w, {}, netFor(s.variant));
  const opp = opponent(s.turn);
  let best = Number.NEGATIVE_INFINITY;
  let bestOption = options[0]!;
  let chosen: number | null = null;
  for (const o of options) {
    const value = o.end ? v.end(o, s.turn) : v.position(o.board, opp);
    if (value > best) {
      best = value;
      bestOption = o;
    }
    if (boardKey(o.board) === key) chosen = value;
  }
  if (chosen === null) return null;
  return {
    choices: options.length,
    agrees: boardKey(bestOption.board) === key,
    loss: best - chosen,
    best: bestOption.moves,
  };
};

/**
 * How far below the opponent's (live-cube) drop point the bot doubles, for market losers;
 * contact estimates are rougher than race formulas, so they keep a smaller margin. In a money
 * game without gammons the live drop point is ~79–80 %, i.e. doubling at 69–74 % as before.
 */
const DOUBLE_MARGIN: Record<Exclude<BotLevel, "easy">, { race: number; contact: number }> = {
  medium: { race: 0.1, contact: 0.05 },
  hard: { race: 0.11, contact: 0.07 },
  expert: { race: 0.11, contact: 0.07 },
};

/** Cube efficiency (Janowski): how much of the ideal recube value a cube owner realises. */
const CUBE_EFFICIENCY = { race: 0.8, contact: 0.68 };

const mirror = (o: Outcomes): Outcomes => ({
  win: 1 - o.win,
  gammonWin: o.gammonLoss,
  backgammonWin: o.backgammonLoss,
  gammonLoss: o.gammonWin,
  backgammonLoss: o.backgammonWin,
});

/** Cubeless take point: the minimum win chance to take a double to `value` (gammon rates from `o`). */
const deadTakePoint = (o: Outcomes, value: number, u: Utility): number => {
  const hi = expectedUtility({ ...o, win: 1 }, value, u, true);
  const lo = expectedUtility({ ...o, win: 0 }, value, u, true);
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, (u(-value / 2) - lo) / (hi - lo)));
};

/**
 * Take point of `taker` facing a double, including the value of owning the cube afterwards:
 * TP = TP_dead · (1 − x · TP_redouble), where TP_redouble is the doubler's take point if the
 * taker later redoubles. Money play without gammons: 25 % · (1 − 0.68 · 25 %) ≈ 21 %.
 * `o` holds the outcomes from the taker's point of view.
 */
const liveTakePoint = (s: GameState, taker: Player, o: Outcomes, m: MatchContext): number => {
  const c = s.cube.value;
  const doubler = opponent(taker);
  const dead = deadTakePoint(o, 2 * c, utilityFor(s, taker, m));
  // Winning 2c already wins the match for the taker: owning the cube adds nothing.
  if (m.length > 0 && 2 * c >= m.length - m.score[taker]) return dead;
  const redouble = Math.min(0.5, deadTakePoint(mirror(o), 4 * c, utilityFor(s, doubler, m)));
  const x = CUBE_EFFICIENCY[isContact(s.variant, s.board) ? "contact" : "race"];
  return dead * (1 - x * redouble);
};

/**
 * Should the player on roll double now? (`state.phase` must be `rolling`.)
 * Uses the match equity table (or points in money play) for no double / double-take /
 * double-pass and doubles shortly before the opponent's drop point – unless the position is
 * too good, i.e. playing on for a gammon is worth more than the opponent's pass.
 */
export const shouldDouble = (s: GameState, level: BotLevel, m: MatchContext = MONEY): boolean => {
  if (!canDouble(s) || level === "easy") return false;
  const p = s.turn;
  const o = opponent(p);
  if (m.length > 0) {
    const needMe = m.length - m.score[p];
    const needOpp = m.length - m.score[o];
    // A cube that already wins us the match is dead for us.
    if (s.cube.value >= needMe) return false;
    // Post-Crawford: the trailer doubles at once.
    if (m.crawford === "done" && needOpp === 1 && needMe > 1) return true;
  }
  const out = positionOutcomes(s, s.board, p, p, levelNet(s, level));
  const u = utilityFor(s, p, m);
  const c = s.cube.value;
  const noDouble = expectedUtility(out, c, u, gammonsCount(s));
  const pass = u(c);
  const take = expectedUtility(out, 2 * c, u, true);
  const opponentTakePoint = liveTakePoint(s, o, mirror(out), m);
  const opponentPasses = 1 - out.win < opponentTakePoint;
  const tolerance = 0.01 * (u(c) - u(-c));
  // Too good: playing on for the gammon is clearly worth more than the opponent's pass.
  if (opponentPasses && noDouble > pass + tolerance) return false;
  const margin = DOUBLE_MARGIN[level][isContact(s.variant, s.board) ? "contact" : "race"];
  return out.win >= 1 - opponentTakePoint - margin && Math.min(take, pass) >= noDouble - tolerance;
};

/** Should the player facing a double take it? (`state.phase` must be `cube-offered`.) */
export const shouldTake = (s: GameState, level: BotLevel, m: MatchContext = MONEY): boolean => {
  const taker = opponent(s.turn);
  if (m.length > 0) {
    const needDoubler = m.length - m.score[s.turn];
    // If losing this game at the current value already loses the match, passing gains nothing.
    if (needDoubler <= s.cube.value) return true;
  }
  if (level === "easy") return true;
  const out = positionOutcomes(s, s.board, taker, s.turn, levelNet(s, level));
  return out.win >= liveTakePoint(s, taker, out, m);
};

/**
 * Should the bot accept the opponent's offer to resign (`s.resignOffer` must be set)?
 * Accepts when the offered result is worth at least what playing on is expected to bring.
 */
export const shouldAcceptResign = (s: GameState, m: MatchContext = MONEY): boolean => {
  const offer = s.resignOffer;
  if (!offer) return false;
  const me = opponent(offer.player);
  if (offer.level >= maxResultLevel(s, me)) return true;
  const u = utilityFor(s, me, m);
  const c = s.cube.value;
  // The offering player is on turn.
  const out = positionOutcomes(s, s.board, me, offer.player, netFor(s.variant));
  const expected = expectedUtility(out, c, u, gammonsCount(s));
  const tolerance = 0.025 * (u(c) - u(-c));
  return u(offer.level * c) >= expected - tolerance;
};
