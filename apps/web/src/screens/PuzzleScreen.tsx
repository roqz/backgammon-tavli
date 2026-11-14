import { applyAction, canConfirm, getVariant, type Move } from "@tavli/engine";
import { useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";
import { askBot } from "../bot/client";
import { Button, Card } from "../components/ui";
import { useT } from "../i18n";
import { gradePuzzle, type Puzzle, streak, today, usePuzzles } from "../puzzle";
import { useBoardTheme } from "../rewards";
import { usePortraitPhone } from "./GameScreen";
import { useSidewaysBoardStyle } from "./PhoneGame";

/** The puzzle of the day: find the best move; the first answer counts for the streak. */
export function PuzzleScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const theme = useBoardTheme();
  const portrait = usePortraitPhone();
  const boardStyle = useSidewaysBoardStyle();
  const date = useMemo(() => today(), []);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState(false);
  const [state, setState] = useState<Puzzle["state"] | null>(null);
  const [graded, setGraded] = useState<{ solved: boolean; loss: number } | null>(null);
  const [showBest, setShowBest] = useState(false);
  const results = usePuzzles((s) => s.results);
  const record = usePuzzles((s) => s.record);

  useEffect(() => {
    askBot({ kind: "puzzle", date })
      .then((p) => {
        setPuzzle(p);
        setState(p.state);
      })
      .catch(() => setError(true));
  }, [date]);

  const layout = useMemo(() => (state ? layoutFromBoard(state.board) : null), [state]);
  if (error) return <Centered onBack={onBack} text={t.errors.generic} />;
  if (!puzzle || !state || !layout) return <Centered onBack={onBack} text={t.puzzleLoading} />;

  const solver = puzzle.state.turn;
  const done = state.phase === "moving" && canConfirm(state);
  const earlier = results[date];
  const check = () => {
    const r = gradePuzzle(puzzle, state.board);
    setGraded(r);
    record(date, r);
  };
  const retry = () => {
    setState(puzzle.state);
    setGraded(null);
    setShowBest(false);
  };
  const play = (chain: Move[]) => {
    let s = state;
    for (const move of chain) s = applyAction(s, { type: "move", move });
    setState(s);
  };
  const shownState = showBest ? puzzle.state : state;
  const color = solver === 0 ? t.white : t.black;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-2 sm:p-4">
      <div className="flex items-center gap-2 px-1">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          ←
        </Button>
        <h1 className="flex-1 text-xl font-bold text-amber-100">🧩 {t.puzzle}</h1>
        <span className="text-sm text-stone-400" title={t.puzzleStreak}>
          🔥 {streak(results)}
        </span>
      </div>
      <Card className="flex flex-col gap-1 p-4">
        <p className="text-sm text-stone-400">
          {new Date(`${date}T12:00:00`).toLocaleDateString(t.locale, { dateStyle: "full" })} ·{" "}
          {getVariant(puzzle.variant).name}
        </p>
        <p className="text-stone-100">
          {t.puzzleTask
            .replace("{color}", color)
            .replace("{dice}", `${puzzle.state.dice?.[0]}-${puzzle.state.dice?.[1]}`)}
        </p>
        {earlier && !graded && (
          <p className="text-xs text-stone-500">
            {earlier.solved ? `✓ ${t.puzzleAlreadySolved}` : t.puzzleAlreadyTried}
          </p>
        )}
      </Card>
      <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40" style={boardStyle}>
        <Board
          state={shownState}
          layout={showBest ? layoutFromBoard(puzzle.state.board) : layout}
          theme={theme}
          interactive={!done && !graded}
          openingDice={null}
          numbersFor={solver}
          viewer={solver}
          onMoves={play}
          hint={showBest ? puzzle.best : null}
          rotated={portrait}
        />
      </div>
      <div aria-live="polite" className="min-h-6 text-center">
        {graded?.solved && <p className="font-semibold text-emerald-300">✓ {t.puzzleSolved}</p>}
        {graded && !graded.solved && (
          <p className="text-amber-300">
            {t.puzzleMissed.replace("{loss}", Number.isFinite(graded.loss) ? graded.loss.toFixed(3) : "?")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {!graded && (
          <>
            <Button onClick={retry} disabled={state === puzzle.state}>
              ↺ {t.tutorialReset}
            </Button>
            <Button variant="primary" disabled={!done} onClick={check}>
              ✓ {t.puzzleCheck}
            </Button>
          </>
        )}
        {graded && (
          <>
            <Button onClick={() => setShowBest((b) => !b)}>
              {showBest ? t.puzzleMyMove : `💡 ${t.puzzleShowBest}`}
            </Button>
            <Button onClick={retry}>↺ {t.puzzleRetry}</Button>
          </>
        )}
      </div>
      <p className="text-center text-xs text-stone-500">{t.puzzleHint}</p>
    </div>
  );
}

function Centered({ text, onBack }: { text: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center">
      <p className="text-stone-400">{text}</p>
      <Button onClick={onBack}>← {t.back}</Button>
    </div>
  );
}
