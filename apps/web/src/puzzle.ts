import { chooseMoves, rankTurnOptions } from "@tavli/ai";
import {
  applyAction,
  type Board,
  createGame,
  type GameState,
  type PlayedMove,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The variant of the day rotates through all four. */
export const PUZZLE_VARIANTS: readonly VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];

/** A position from bot self-play where one move is clearly better than every other. */
export interface Puzzle {
  readonly date: string;
  readonly variant: VariantId;
  /** After the roll, the player on turn (\`state.turn\`) is the solver. */
  readonly state: GameState;
  readonly best: readonly PlayedMove[];
  /** Points per game the second-best move loses. */
  readonly gap: number;
  readonly options: number;
}

/** A clear best move: at least this far ahead of the second best (and not a trivial position). */
const MIN_GAP = 0.06;
const MIN_OPTIONS = 4;

/** Local calendar date as YYYY-MM-DD. */
export const today = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/**
 * The puzzle of a day: deterministic (same date → same puzzle everywhere, also offline). The
 * strong bot plays against itself from a seed of the date; the first decision after the
 * opening with a clear best move becomes the puzzle.
 */
export function generatePuzzle(date: string): Puzzle {
  const day = dayNumber(date);
  const variant = PUZZLE_VARIANTS[((day % 4) + 4) % 4]!;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = seededRng(day * 7919 + attempt * 104_729);
    let s = createGame({ variant, starter: 0, cube: false });
    while (s.phase === "opening") {
      const dice = rollDice(rng);
      s = applyAction(s, { type: "roll", dice });
    }
    for (let step = 0; step < 200 && s.phase !== "finished"; step++) {
      if (s.phase === "rolling") {
        s = applyAction(s, { type: "roll", dice: rollDice(rng) });
        continue;
      }
      if (s.phase !== "moving") break;
      if (s.history.length >= 6) {
        const ranked = rankTurnOptions(s);
        if (ranked.length >= MIN_OPTIONS && ranked[0]!.value - ranked[1]!.value >= MIN_GAP)
          return {
            date,
            variant,
            state: s,
            best: ranked[0]!.moves,
            gap: ranked[0]!.value - ranked[1]!.value,
            options: ranked.length,
          };
      }
      for (const move of chooseMoves(s, "hard", rng)) s = applyAction(s, { type: "move", move });
      if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
    }
  }
  throw new Error(`no puzzle found for ${date}`);
}

const sameBoard = (a: Board, b: Board) =>
  JSON.stringify([a.points, a.bar, a.off, a.pinned]) === JSON.stringify([b.points, b.bar, b.off, b.pinned]);

/** How good the solver's move was: 0 = the best move, otherwise points lost. */
export const gradePuzzle = (p: Puzzle, played: Board): { solved: boolean; loss: number } => {
  const ranked = rankTurnOptions(p.state);
  const mine = ranked.find((o) => sameBoard(o.board, played));
  const loss = mine ? ranked[0]!.value - mine.value : Number.POSITIVE_INFINITY;
  return { solved: loss < 1e-9, loss };
};

interface PuzzleStore {
  /** First answer per date. */
  results: Record<string, { solved: boolean; loss: number }>;
  record: (date: string, r: { solved: boolean; loss: number }) => void;
}

export const usePuzzles = create<PuzzleStore>()(
  persist(
    (set) => ({
      results: {},
      record: (date, r) => set((s) => (s.results[date] ? s : { results: { ...s.results, [date]: r } })),
    }),
    { name: "tavli.puzzles", version: 1 },
  ),
);

/** Solved days in a row up to today (today counts once answered correctly). */
export const streak = (results: PuzzleStore["results"], date = today()): number => {
  let n = 0;
  const d = new Date(`${date}T12:00:00`);
  if (!results[today(d)]?.solved) d.setDate(d.getDate() - 1);
  while (results[today(d)]?.solved) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
};
