import { getVariant, type Player, pipCount } from "@tavli/engine";
import { useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";

import { Button } from "../components/ui";
import { lengthText, useT } from "../i18n";
import { stopWatching } from "../online/client";
import { useOnline } from "../online/store";
import { useBoardTheme } from "../rewards";
import { useSettings } from "../store/settings";
import { Checker, usePortraitPhone } from "./GameScreen";
import { useSidewaysBoardStyle } from "./PhoneGame";
import { roundName } from "./TournamentPanel";

/** Read-only view of a running public match. */
export function WatchScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const watch = useOnline((s) => s.watch);
  const lastError = useOnline((s) => s.lastError);
  const settings = useSettings();
  const theme = useBoardTheme();
  const portrait = usePortraitPhone();
  const boardStyle = useSidewaysBoardStyle();
  const board = watch?.match.game.board;
  const layout = useMemo(() => (board ? layoutFromBoard(board) : null), [board]);
  const leave = () => {
    stopWatching();
    onBack();
  };

  if (!watch || !layout) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center">
        <p className="text-stone-400">
          {lastError === "match not watchable" ? t.watchUnavailable : t.loading}
        </p>
        <Button onClick={leave}>← {t.back}</Button>
      </div>
    );
  }
  const g = watch.match.game;
  const rules = getVariant(g.variant);
  const name = (p: Player) => watch.players[p].name;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-2 sm:p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="ghost" onClick={leave} className="px-3 py-1.5 text-sm" aria-label={t.back}>
          ← <span className="hidden sm:inline">{t.back}</span>
        </Button>
        <div className="min-w-0 truncate text-center text-xs text-stone-400 sm:text-sm">
          <span className="font-semibold text-stone-200">👁 {t.watching}</span> · {rules.name} ·{" "}
          {lengthText(t, watch.length)}
          {watch.tournament &&
            ` · 🏆 ${watch.tournament.name} · ${roundName(t, watch.tournament.round, watch.tournament.rounds, watch.tournament.format)}`}
        </div>
        <span className="flex gap-2 text-xs text-stone-500">
          {watch.private && <span title={t.watchPrivate}>🔒</span>}
          {watch.delayMs > 0 && <span title={t.watchDelayHint}>⏳ {Math.round(watch.delayMs / 1000)} s</span>}
          <span title={t.spectators}>👁 {watch.spectators}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {([0, 1] as Player[]).map((p) => {
          const toAct = g.phase !== "finished" && g.turn === p;
          return (
            <div
              key={p}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${toAct ? "border-amber-400/60 bg-amber-400/10" : "border-stone-800 bg-stone-900/70"}`}
            >
              <Checker player={p} />
              <span className="min-w-0 flex-1 truncate text-stone-100">
                {name(p)} <span className="text-xs text-stone-500">{watch.players[p].rating}</span>
              </span>
              <span className="text-xs text-stone-500">{pipCount(rules, g.board, p)}</span>
              <span className="text-base font-bold tabular-nums">{watch.match.score[p]}</span>
            </div>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40" style={boardStyle}>
        <Board
          state={g}
          layout={layout}
          theme={theme}
          interactive={false}
          openingDice={watch.opening ? { dice: watch.opening, seq: 0 } : null}
          numbersFor={settings.showNumbers ? 0 : null}
          viewer={0}
          onMoves={() => {}}
          rotated={portrait}
          mirrored={settings.homeLeft}
        />
      </div>
      <Clock deadline={watch.deadline === null ? null : watch.deadline - watch.clockOffset} />
      {watch.end && (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-center text-amber-200">
          🏁 {name(watch.end.winner)} {t.winsMatch} · {watch.end.score[0]}:{watch.end.score[1]}
        </p>
      )}
    </div>
  );
}

function Clock({ deadline }: { deadline: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  return (
    <p className="text-center font-mono text-sm tabular-nums text-stone-400">
      ⏱ {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </p>
  );
}
