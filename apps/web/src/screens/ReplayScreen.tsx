import { getVariant, MAT_VARIANTS, type Player, toMat } from "@tavli/engine";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { applyMoveToLayout, layoutFromBoard } from "../board/layout";
import { THEMES } from "../board/themes";
import { askBot } from "../bot/client";
import { humanSeat } from "../bot/useBotDriver";
import { Button } from "../components/ui";
import { turnText, useT } from "../i18n";
import { buildFrames } from "../replay";
import type { GameReview, MistakeClass, ReviewedTurn } from "../review";
import type { GameRecord } from "../store/archive";
import { useSettings } from "../store/settings";
import { usePortraitPhone } from "./GameScreen";

const STEP_MS = 750;

/** Downloads the games as a .mat file for GNU Backgammon / eXtreme Gammon. */
const downloadMat = (records: readonly GameRecord[]) => {
  const first = records[0]!;
  let score: [number, number] = [0, 0];
  const games = records.map((r) => {
    const game = { history: r.history, result: r.result, score };
    score = [...score] as [number, number];
    score[r.result.winner] += r.result.points;
    return game;
  });
  const text = toMat({
    variant: first.variant,
    length: first.matchLength,
    players: [first.players[0].name, first.players[1].name],
    games,
  });
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `tavli-${first.date.slice(0, 10)}.mat`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Replays one or several games (e.g. all games of an online match). */
export function ReplayScreen({ records, onBack }: { records: readonly GameRecord[]; onBack: () => void }) {
  const t = useT();
  const [game, setGame] = useState(0);
  const exportable = records.every((r) => MAT_VARIANTS.includes(r.variant));
  const tabs = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {records.length > 1 && (
        <>
          {records.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setGame(i)}
              className={`rounded-lg border px-3 py-1 text-sm ${
                i === game
                  ? "border-amber-400 bg-amber-400/15 text-amber-200"
                  : "border-stone-700 text-stone-300"
              }`}
            >
              {t.game} {i + 1}
            </button>
          ))}
        </>
      )}
      {exportable && (
        <Button
          variant="ghost"
          className="px-3 py-1 text-sm"
          title={t.exportMatHint}
          onClick={() => downloadMat(records)}
        >
          ⬇ .mat
        </Button>
      )}
    </div>
  );
  return <SingleReplay key={game} record={records[game]!} onBack={onBack} tabs={tabs} />;
}

function SingleReplay({ record, onBack, tabs }: { record: GameRecord; onBack: () => void; tabs: ReactNode }) {
  const t = useT();
  // Same board view as in the game: portrait rotation, mirrored home, point numbers.
  const portrait = usePortraitPhone();
  const homeLeft = useSettings((s) => s.homeLeft);
  const showNumbers = useSettings((s) => s.showNumbers);
  const style = useSettings((s) => s.style);
  const frames = useMemo(() => buildFrames(record.variant, record.history), [record]);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState(() => layoutFromBoard(frames[0]!.state.board));
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;
  /** Review of the checker play (computed on demand in the bot worker). */
  const [review, setReview] = useState<GameReview | "running" | null>(null);
  const reviewOf = useMemo(() => {
    const m = new Map<number, ReviewedTurn>();
    if (review && review !== "running") for (const turn of review.turns) m.set(turn.recordIndex, turn);
    return m;
  }, [review]);
  const runReview = async () => {
    setReview("running");
    try {
      setReview(await askBot({ kind: "review", variant: record.variant, history: record.history }));
    } catch {
      setReview(null);
    }
  };

  const go = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(last, next));
      const frame = frames[target]!;
      setLayout((current) =>
        target === index + 1 && frame.move && frame.mover !== null
          ? applyMoveToLayout(current, record.variant, frame.mover, frame.move)
          : layoutFromBoard(frame.state.board),
      );
      setIndex(target);
    },
    [frames, index, last, record.variant],
  );

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => go(index + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, index, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const frame = frames[index]!;
  const name = (p: Player) => record.players[p].name;
  const seat = humanSeat(record.players);
  const r = record.result;
  // Last frame index for each history record, to jump there from the list.
  const lastFrameOf = (recordIndex: number) => frames.findLastIndex((f) => f.recordIndex === recordIndex);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2 sm:p-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <Button variant="ghost" onClick={onBack} className="px-3 py-1.5 text-sm">
            ← {t.back}
          </Button>
          <div className="text-center text-sm text-stone-400">
            <span className="font-semibold text-stone-200">{getVariant(record.variant).name}</span> ·{" "}
            {new Date(record.date).toLocaleString(t.locale)} · {name(r.winner)} {t.wins} (+{r.points})
          </div>
          <div className="w-16" />
        </div>
        {tabs}
        <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40">
          <Board
            state={frame.state}
            layout={layout}
            theme={THEMES[style]}
            interactive={false}
            openingDice={null}
            numbersFor={showNumbers ? (seat ?? 0) : null}
            viewer={seat ?? 0}
            onMoves={() => {}}
            rotated={portrait}
            mirrored={homeLeft}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => go(0)} aria-label={t.toStart}>
              ⏮
            </Button>
            <Button onClick={() => go(index - 1)} aria-label={t.previous}>
              ◀
            </Button>
            <Button variant="primary" className="min-w-28" onClick={() => setPlaying(!playing)}>
              {playing ? `⏸ ${t.pause}` : `▶ ${t.play}`}
            </Button>
            <Button onClick={() => go(index + 1)} aria-label={t.next}>
              ▶
            </Button>
            <Button onClick={() => go(last)} aria-label={t.toEnd}>
              ⏭
            </Button>
          </div>
          <input
            type="range"
            min={0}
            max={last}
            value={index}
            onChange={(e) => go(Number(e.target.value))}
            className="w-full max-w-xl accent-amber-500"
            aria-label={t.replay}
          />
          <span className="text-sm text-stone-500 tabular-nums">
            {index} / {last}
          </span>
        </div>
      </div>
      <aside className="flex w-full flex-col gap-3 rounded-2xl border border-stone-800 bg-stone-900/80 p-4 lg:w-80">
        {review === null && <Button onClick={() => void runReview()}>🔍 {t.reviewGame}</Button>}
        {review === "running" && (
          <p className="flex items-center gap-2 text-sm text-stone-400">
            <span className="h-3 w-3 rounded-full border-2 border-stone-600 border-t-amber-400 motion-safe:animate-spin" />
            {t.reviewRunning}
          </p>
        )}
        {review && review !== "running" && <ReviewSummary review={review} names={[name(0), name(1)]} />}
        {review && review !== "running" && frame.recordIndex >= 0 && reviewOf.get(frame.recordIndex) && (
          <MistakeDetail turn={reviewOf.get(frame.recordIndex)!} />
        )}
        <h2 className="text-sm font-medium text-stone-400">{t.history}</h2>
        <ol className="max-h-[60vh] overflow-y-auto font-mono text-sm">
          {record.history.map((rec, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: history is immutable
            <li key={i}>
              <button
                type="button"
                onClick={() => go(lastFrameOf(i))}
                className={`w-full rounded px-2 py-0.5 text-left ${
                  frame.recordIndex === i
                    ? "bg-amber-400/20 text-amber-100"
                    : "text-stone-300 hover:bg-stone-800"
                }`}
              >
                {rec.player === 0 ? "○" : "●"} {turnText(t, record.variant, rec)}
                {reviewOf.get(i) && <MistakeMark mistake={reviewOf.get(i)!.mistake} />}
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

const MARKS: Record<MistakeClass, { sign: string; className: string } | null> = {
  ok: null,
  inaccurate: { sign: "?!", className: "text-yellow-300" },
  error: { sign: "?", className: "text-orange-400" },
  blunder: { sign: "??", className: "text-red-400" },
};

/** Annotation like in chess: ?! inaccuracy, ? error, ?? blunder. */
function MistakeMark({ mistake }: { mistake: MistakeClass }) {
  const t = useT();
  const mark = MARKS[mistake];
  if (!mark) return null;
  return (
    <span className={`ml-1 font-bold ${mark.className}`} title={t.mistakeNames[mistake]}>
      {mark.sign}
    </span>
  );
}

/** Error rate, accuracy and mistakes per player. */
function ReviewSummary({ review, names }: { review: GameReview; names: readonly [string, string] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="review">
      <h2 className="font-medium text-stone-400">{t.reviewTitle}</h2>
      {([0, 1] as Player[]).map((p) => {
        const r = review.players[p];
        return (
          <div key={p} className="rounded-lg bg-stone-800/60 px-3 py-2">
            <div className="font-semibold text-stone-100">{names[p]}</div>
            {r.decisions === 0 ? (
              <div className="text-xs text-stone-500">{t.reviewNoDecisions}</div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 text-xs text-stone-300">
                <span title={t.errorRateHint}>
                  {t.errorRate}: <b className="tabular-nums">{r.errorRate.toFixed(1)}</b>
                </span>
                <span>
                  {t.accuracy}: <b className="tabular-nums">{Math.round(r.accuracy * 100)} %</b>
                </span>
                <span className="col-span-2 mt-0.5 text-stone-400">
                  <span className="text-red-400">??</span> {r.blunders} ·{" "}
                  <span className="text-orange-400">?</span> {r.errors} ·{" "}
                  <span className="text-yellow-300">?!</span> {r.inaccuracies} · {r.decisions} {t.decisions}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-stone-500">{t.reviewHint}</p>
    </div>
  );
}

/** The selected move compared with the best one. */
function MistakeDetail({ turn }: { turn: ReviewedTurn }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-stone-700 px-3 py-2 text-sm">
      <div className="text-stone-300">
        {t.playedMove}: <span className="font-mono text-stone-100">{turn.played}</span>
        <MistakeMark mistake={turn.mistake} />
      </div>
      {turn.mistake === "ok" && turn.loss < 1e-9 ? (
        <div className="text-emerald-300">✓ {t.bestMovePlayed}</div>
      ) : (
        <div className="text-stone-300">
          {t.bestMove}: <span className="font-mono text-amber-200">{turn.best}</span>{" "}
          <span className="text-xs text-stone-500">(−{turn.loss.toFixed(3)})</span>
        </div>
      )}
    </div>
  );
}
