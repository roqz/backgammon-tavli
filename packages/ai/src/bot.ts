import {
  type CrawfordState,
  canDouble,
  diceToPlay,
  type GameState,
  type Move,
  moveGenerator,
  opponent,
  type Player,
  type Rng,
  type TurnOption,
} from "@tavli/engine";
import { evaluate, isContact, winProbability } from "./evaluate";

export type BotLevel = "easy" | "medium" | "hard";

export const BOT_LEVELS: readonly BotLevel[] = ["easy", "medium", "hard"];

/** The 21 distinct rolls with their probability weights (doubles 1/36, others 2/36). */
const ROLLS: readonly { dice: number[]; weight: number }[] = (() => {
  const out: { dice: number[]; weight: number }[] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) out.push({ dice: diceToPlay(a, b), weight: (a === b ? 1 : 2) / 36 });
  }
  return out;
})();

const WIN = 10_000;
const HARD_CANDIDATES = 6;

const scoreOption = (s: GameState, p: Player, o: TurnOption): number =>
  o.end ? WIN : evaluate(s.variant, o.board, p);

/** Expected value for `p` after playing `option`, assuming the opponent replies with its best 1-ply move. */
const twoPly = (s: GameState, p: Player, option: TurnOption): number => {
  if (option.end) return WIN;
  const opp = opponent(p);
  const gen = moveGenerator(s.variant, opp);
  let expected = 0;
  for (const roll of ROLLS) {
    const replies = gen.turnOptions(option.board, roll.dice);
    let best = Number.NEGATIVE_INFINITY;
    if (replies.length === 0) best = evaluate(s.variant, option.board, opp);
    for (const r of replies) {
      const v = r.end ? WIN : evaluate(s.variant, r.board, opp);
      if (v > best) best = v;
      if (best >= WIN) break;
    }
    expected += roll.weight * -best;
  }
  return expected;
};

const gaussian = (rng: Rng): number => {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

/**
 * Chooses the moves for the rest of the current turn (`state.phase` must be `moving`).
 * - easy:   1-ply with noise and occasional random moves
 * - medium: best 1-ply evaluation
 * - hard:   2-ply expectimax over the best candidates
 */
export const chooseMoves = (s: GameState, level: BotLevel, rng: Rng): Move[] => {
  if (s.phase !== "moving") return [];
  const p = s.turn;
  const options = moveGenerator(s.variant, p).turnOptions(s.board, s.remaining);
  if (options.length === 0) return [];
  const pick = (o: TurnOption): Move[] => o.moves.map(({ from, to, die }) => ({ from, to, die }));
  if (options.length === 1) return pick(options[0]!);

  if (level === "easy" && rng() < 0.25) return pick(options[Math.floor(rng() * options.length)]!);

  const scored = options.map((o) => ({
    o,
    v: scoreOption(s, p, o) + (level === "easy" ? gaussian(rng) * 10 : 0),
  }));
  scored.sort((a, b) => b.v - a.v);
  if (level !== "hard" || scored[0]!.o.end) return pick(scored[0]!.o);

  let best = scored[0]!;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const c of scored.slice(0, HARD_CANDIDATES)) {
    const v = twoPly(s, p, c.o);
    if (v > bestValue) {
      bestValue = v;
      best = c;
    }
  }
  return pick(best.o);
};

export interface MatchContext {
  /** 0 = unlimited money session. */
  readonly length: number;
  readonly score: readonly [number, number];
  readonly crawford: CrawfordState;
}

const MONEY: MatchContext = { length: 0, score: [0, 0], crawford: "pending" };

/** Minimum win chance to double; contact estimates are rougher than race formulas, so they need more. */
const DOUBLE_AT: Record<BotLevel, { race: number; contact: number }> = {
  easy: { race: 2, contact: 2 },
  medium: { race: 0.7, contact: 0.74 },
  hard: { race: 0.69, contact: 0.72 },
};
const TAKE_ABOVE: Record<BotLevel, number> = { easy: 0, medium: 0.25, hard: 0.23 };

/** Should the player on roll double now? (`state.phase` must be `rolling`.) */
export const shouldDouble = (s: GameState, level: BotLevel, m: MatchContext = MONEY): boolean => {
  if (!canDouble(s)) return false;
  const p = s.turn;
  const o = opponent(p);
  if (m.length > 0) {
    const needMe = m.length - m.score[p];
    const needOpp = m.length - m.score[o];
    // A cube that already wins us the match is dead for us.
    if (s.cube.value >= needMe) return false;
    // Post-Crawford: the trailer doubles at once, the leader can only pass a free point.
    if (m.crawford === "done" && needOpp === 1 && needMe > 1) return true;
  }
  const pWin = winProbability(s.variant, s.board, p);
  const contact = isContact(s.variant, s.board);
  if (pWin < DOUBLE_AT[level][contact ? "contact" : "race"]) return false;
  // Too good to double: keep playing for a gammon when one is realistic.
  const gammonish = contact && s.board.off[o] === 0 && s.board.off[p] > 0;
  return !(pWin > 0.9 && gammonish && !s.jacoby);
};

/** Should the player facing a double take it? (`state.phase` must be `cube-offered`.) */
export const shouldTake = (s: GameState, level: BotLevel, m: MatchContext = MONEY): boolean => {
  if (m.length > 0) {
    const needDoubler = m.length - m.score[s.turn];
    // If losing this game at the current value already loses the match, passing gains nothing.
    if (needDoubler <= s.cube.value) return true;
  }
  const pDoubler = winProbability(s.variant, s.board, s.turn);
  return 1 - pDoubler >= TAKE_ABOVE[level];
};
