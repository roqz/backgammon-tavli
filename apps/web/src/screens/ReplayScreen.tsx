import { getVariant, type Player } from "@tavli/engine";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { applyMoveToLayout, layoutFromBoard } from "../board/layout";
import { THEMES } from "../board/themes";
import { humanSeat } from "../bot/useBotDriver";
import { Button } from "../components/ui";
import { turnText, useT } from "../i18n";
import { buildFrames } from "../replay";
import type { GameRecord } from "../store/archive";
import { useSettings } from "../store/settings";
import { usePortraitPhone } from "./GameScreen";

const STEP_MS = 750;

/** Replays one or several games (e.g. all games of an online match). */
export function ReplayScreen({ records, onBack }: { records: readonly GameRecord[]; onBack: () => void }) {
  const t = useT();
  const [game, setGame] = useState(0);
  const tabs =
    records.length > 1 ? (
      <div className="flex flex-wrap justify-center gap-2">
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
      </div>
    ) : null;
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
      <aside className="w-full rounded-2xl border border-stone-800 bg-stone-900/80 p-4 lg:w-72">
        <h2 className="mb-2 text-sm font-medium text-stone-400">{t.history}</h2>
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
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
