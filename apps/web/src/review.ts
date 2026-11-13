import { reviewTurn } from "@tavli/ai";
import {
  applyMoveUnchecked,
  type Board,
  type Cube,
  createGame,
  formatTurn,
  getVariant,
  initialBoard,
  type Player,
  type TurnRecord,
  type VariantId,
} from "@tavli/engine";

/**
 * Classes of checker-play mistakes by equity lost (points per game, cube 1), close to the usual
 * analysis programs: small slips are "inaccurate", clear mistakes "error", big ones "blunder".
 */
export const MISTAKE = { inaccurate: 0.03, error: 0.08, blunder: 0.16 } as const;
export type MistakeClass = "ok" | "inaccurate" | "error" | "blunder";

export const classify = (loss: number): MistakeClass =>
  loss >= MISTAKE.blunder
    ? "blunder"
    : loss >= MISTAKE.error
      ? "error"
      : loss >= MISTAKE.inaccurate
        ? "inaccurate"
        : "ok";

/** One reviewed checker-play decision (forced moves are skipped). */
export interface ReviewedTurn {
  readonly recordIndex: number;
  readonly player: Player;
  readonly loss: number;
  readonly choices: number;
  readonly mistake: MistakeClass;
  /** Notation of the played and of the best move, e.g. "13/7 8/7". */
  readonly played: string;
  readonly best: string;
}

export interface PlayerReview {
  readonly decisions: number;
  /** Average equity lost per decision × 1000 (lower is better; strong players stay below ~5). */
  readonly errorRate: number;
  /** Share of decisions where the best move was played. */
  readonly accuracy: number;
  readonly inaccuracies: number;
  readonly errors: number;
  readonly blunders: number;
}

export interface GameReview {
  readonly turns: readonly ReviewedTurn[];
  readonly players: readonly [PlayerReview, PlayerReview];
}

const movesText = (
  variant: VariantId,
  rec: TurnRecord & { kind: "move" },
  moves: typeof rec.moves,
): string => {
  const text = formatTurn(variant, { ...rec, moves });
  return text.slice(text.indexOf(":") + 2);
};

/**
 * Reviews every checker-play decision of a game against the strong bot's 1-ply evaluation.
 * Cube decisions are not reviewed. Runs in the bot worker (100–200 ms per decision).
 */
export function reviewGame(
  variant: VariantId,
  history: readonly TurnRecord[],
  onProgress?: (done: number, total: number) => void,
): GameReview {
  const rules = getVariant(variant);
  const base = createGame({ variant, starter: 0 });
  let board: Board = initialBoard(rules);
  let cube: Cube = base.cube;
  const turns: ReviewedTurn[] = [];
  const total = history.filter((r) => r.kind === "move").length;
  let done = 0;
  history.forEach((rec, i) => {
    if (rec.kind === "take") cube = { ...cube, value: cube.value * 2, owner: rec.player };
    if (rec.kind === "beaver" || rec.kind === "raccoon") cube = { ...cube, value: rec.to, owner: rec.player };
    if (rec.kind !== "move") return;
    const dice = rec.dice;
    const before = board;
    for (const m of rec.moves) board = applyMoveUnchecked(rules, board, rec.player, m).board;
    const state = {
      ...base,
      board: before,
      cube,
      phase: "moving" as const,
      turn: rec.player,
      dice,
      remaining: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]],
      played: [],
    };
    const r = reviewTurn(state, board);
    if (r) {
      turns.push({
        recordIndex: i,
        player: rec.player,
        loss: r.loss,
        choices: r.choices,
        mistake: classify(r.loss),
        played: movesText(variant, rec, rec.moves),
        best: movesText(variant, rec, r.best),
      });
    }
    onProgress?.(++done, total);
  });
  return { turns, players: [summarise(turns, 0), summarise(turns, 1)] };
}

const summarise = (turns: readonly ReviewedTurn[], player: Player): PlayerReview => {
  const mine = turns.filter((t) => t.player === player);
  const n = mine.length;
  const count = (c: MistakeClass) => mine.filter((t) => t.mistake === c).length;
  return {
    decisions: n,
    errorRate: n ? (mine.reduce((s, t) => s + t.loss, 0) / n) * 1000 : 0,
    accuracy: n ? mine.filter((t) => t.loss < 1e-9).length / n : 1,
    inaccuracies: count("inaccurate"),
    errors: count("error"),
    blunders: count("blunder"),
  };
};
