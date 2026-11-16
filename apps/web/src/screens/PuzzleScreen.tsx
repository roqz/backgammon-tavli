import { applyAction, canConfirm, getVariant, type Move } from "@tavli/engine";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Board } from "../board/Board";
import { HEIGHT, WIDTH } from "../board/geometry";
import { layoutFromBoard, useFollowingLayout } from "../board/layout";
import { askBot } from "../bot/client";
import { Icon } from "../components/Icon";
import { Button, Card } from "../components/ui";
import { useT } from "../i18n";
import { gradePuzzle, type Puzzle, streak, today, usePuzzles } from "../puzzle";
import { useBoardTheme } from "../rewards";
import type { RulesTopic } from "../rules";
import { usePortraitPhone } from "./GameScreen";
import { useSidewaysBoardStyle } from "./PhoneGame";
import { RulesDrawer } from "./RulesPanel";

/** The puzzle of the day: find the best move; the first answer counts for the streak. */
export function PuzzleScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const theme = useBoardTheme();
  const portrait = usePortraitPhone();
  const boardStyle = useSidewaysBoardStyle();
  const date = useMemo(() => today(), []);
  // phones held upright: task, board and buttons share one screen (the board cannot be scrolled)
  const boardBox = useRef<HTMLDivElement>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState(false);
  const [state, setState] = useState<Puzzle["state"] | null>(null);
  const [graded, setGraded] = useState<{ solved: boolean; loss: number } | null>(null);
  const [showBest, setShowBest] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const results = usePuzzles((s) => s.results);
  const record = usePuzzles((s) => s.record);
  const fitted = useFittedBoardWidth(boardBox, portrait && puzzle !== null);

  useEffect(() => {
    askBot({ kind: "puzzle", date })
      .then((p) => {
        setPuzzle(p);
        setState(p.state);
      })
      .catch(() => setError(true));
  }, [date]);

  const layout = useFollowingLayout(state?.board ?? null, date);
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
    <div
      className={`mx-auto flex w-full max-w-4xl flex-col p-2 sm:p-4 wide:max-w-[min(56rem,max(30rem,calc((100dvh-19rem)*1.45)))] ${portrait ? "h-dvh gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "gap-3"}`}
      data-testid="puzzle-screen"
    >
      <div className="flex items-center gap-2 px-1">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          <Icon name="back" />
        </Button>
        <h1 className="flex-1 text-xl font-bold text-amber-100">
          <Icon name="puzzle" /> {t.puzzle}
        </h1>
        <span className="text-sm text-stone-400" title={t.puzzleStreak}>
          <Icon name="flame" className="text-amber-400" /> {streak(results)}
        </span>
      </div>
      <Card className={`flex flex-col gap-1 ${portrait ? "p-3" : "p-4"}`}>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full bg-amber-400/15 px-3 py-0.5 text-base font-semibold text-amber-200"
            data-testid="puzzle-variant"
          >
            {getVariant(puzzle.variant).name}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
            {new Date(`${date}T12:00:00`).toLocaleDateString(t.locale, {
              dateStyle: portrait ? "medium" : "full",
            })}
          </span>
          <Button variant="ghost" className="shrink-0 px-2 py-1 text-sm" onClick={() => setRulesOpen(true)}>
            <Icon name="rules" /> {t.rules}
          </Button>
        </div>
        <p className="text-stone-100">
          {t.puzzleTask
            .replace("{color}", color)
            .replace("{dice}", `${puzzle.state.dice?.[0]}-${puzzle.state.dice?.[1]}`)}
        </p>
        {earlier && !graded && (
          <p className="text-xs text-stone-500">
            {earlier.solved ? (
              <>
                <Icon name="check" /> {t.puzzleAlreadySolved}
              </>
            ) : (
              t.puzzleAlreadyTried
            )}
          </p>
        )}
      </Card>
      <div
        ref={boardBox}
        className={portrait ? "flex min-h-0 flex-1 items-start justify-center" : "contents"}
      >
        <div
          className="overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/40"
          style={portrait ? { width: fitted ?? "100%" } : boardStyle}
          data-testid="puzzle-board"
        >
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
      </div>
      <div aria-live="polite" className="min-h-6 text-center">
        {graded?.solved && (
          <p className="font-semibold text-emerald-300">
            <Icon name="check" /> {t.puzzleSolved}
          </p>
        )}
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
              <Icon name="undo" /> {t.tutorialReset}
            </Button>
            <Button variant="primary" disabled={!done} onClick={check}>
              <Icon name="check" /> {t.puzzleCheck}
            </Button>
          </>
        )}
        {graded && (
          <>
            <Button onClick={() => setShowBest((b) => !b)}>
              {showBest ? (
                t.puzzleMyMove
              ) : (
                <>
                  <Icon name="hint" /> {t.puzzleShowBest}
                </>
              )}
            </Button>
            <Button onClick={retry}>
              <Icon name="undo" /> {t.puzzleRetry}
            </Button>
          </>
        )}
      </div>
      {!portrait && <p className="text-center text-xs text-stone-500">{t.puzzleHint}</p>}
      <RulesDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        initial={puzzle.variant as RulesTopic}
      />
    </div>
  );
}

/**
 * Width of the upright (rotated) board so that it fills the box without getting taller than it;
 * null until measured or when not fitting.
 */
function useFittedBoardWidth(box: RefObject<HTMLDivElement | null>, active: boolean): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!active || !el) return setWidth(null);
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      setWidth(Math.floor(Math.min(w, (h * HEIGHT) / WIDTH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, active]);
  return width;
}

function Centered({ text, onBack }: { text: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center">
      <p className="text-stone-400">{text}</p>
      <Button onClick={onBack}>
        <Icon name="back" /> {t.back}
      </Button>
    </div>
  );
}
