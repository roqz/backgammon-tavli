import { getVariant } from "@tavli/engine";
import { useMemo, useState } from "react";
import { humanSeat } from "../bot/useBotDriver";
import { Button, Card, Modal } from "../components/ui";
import { useT } from "../i18n";
import { type GameRecord, useArchive } from "../store/archive";

interface Tally {
  played: number;
  won: number;
  pointsFor: number;
  pointsAgainst: number;
  gammons: number;
}

const emptyTally = (): Tally => ({ played: 0, won: 0, pointsFor: 0, pointsAgainst: 0, gammons: 0 });

const tallyOf = (map: Map<string, Tally>, key: string): Tally => {
  let t = map.get(key);
  if (!t) {
    t = emptyTally();
    map.set(key, t);
  }
  return t;
};

/** Statistics from the human's point of view in games against the computer. */
export const computeStats = (records: readonly GameRecord[]) => {
  const byOpponent = new Map<string, Tally>();
  const byVariant = new Map<string, Tally>();
  const total = emptyTally();
  let hotseat = 0;
  let streak = 0;
  let streakOpen = true;
  for (const r of records) {
    const seat = humanSeat(r.players);
    if (seat === null) {
      hotseat++;
      continue;
    }
    const bot = r.players[seat === 0 ? 1 : 0];
    const won = r.result.winner === seat;
    if (streakOpen) {
      if (won) streak++;
      else streakOpen = false;
    }
    for (const t of [
      total,
      tallyOf(byOpponent, bot.kind === "remote" ? "online" : (bot.level ?? "medium")),
      tallyOf(byVariant, r.variant),
    ]) {
      t.played++;
      if (won) {
        t.won++;
        t.pointsFor += r.result.points;
        if (r.result.level >= 2) t.gammons++;
      } else {
        t.pointsAgainst += r.result.points;
      }
    }
  }
  return { total, byOpponent, byVariant, hotseat, streak };
};

const pct = (t: Tally) => (t.played ? `${Math.round((100 * t.won) / t.played)} %` : "–");

function Row({ label, tally }: { label: string; tally: Tally }) {
  return (
    <tr className="border-t border-stone-800">
      <td className="py-2 pr-3 text-stone-200">{label}</td>
      <td className="py-2 text-right tabular-nums">{tally.played}</td>
      <td className="py-2 text-right tabular-nums">{tally.won}</td>
      <td className="py-2 text-right tabular-nums">{pct(tally)}</td>
      <td className="py-2 text-right tabular-nums">
        {tally.pointsFor}:{tally.pointsAgainst}
      </td>
    </tr>
  );
}

function Table({ title, rows, t }: { title: string; rows: [string, Tally][]; t: ReturnType<typeof useT> }) {
  return (
    <Card>
      <h2 className="mb-2 font-semibold text-stone-200">{title}</h2>
      <table className="w-full text-sm text-stone-400">
        <thead>
          <tr className="text-xs uppercase tracking-wide">
            <th className="pb-1 text-left font-medium" />
            <th className="pb-1 text-right font-medium">{t.gamesShort}</th>
            <th className="pb-1 text-right font-medium">{t.winsShort}</th>
            <th className="pb-1 text-right font-medium">%</th>
            <th className="pb-1 text-right font-medium">{t.points}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, tally]) => (
            <Row key={label} label={label} tally={tally} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function StatsScreen({
  onBack,
  onReplay,
  onPlay,
}: {
  onBack: () => void;
  onReplay: (r: GameRecord) => void;
  onPlay: () => void;
}) {
  const t = useT();
  const records = useArchive((s) => s.records);
  const clear = useArchive((s) => s.clear);
  const [confirmClear, setConfirmClear] = useState(false);
  const stats = useMemo(() => computeStats(records), [records]);
  const levelName: Record<string, string> = { easy: t.easy, medium: t.medium, hard: t.hard };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">{t.stats}</h1>
      </div>

      {records.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-stone-400">{t.noGames}</p>
          <Button variant="primary" onClick={onPlay}>
            {t.playNow}
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t.vsComputer, String(stats.total.played)],
              [t.winRate, pct(stats.total)],
              [t.gammons, String(stats.total.gammons)],
              [t.streak, String(stats.streak)],
            ].map(([label, value]) => (
              <Card key={label} className="!p-4 text-center">
                <div className="text-3xl font-bold text-amber-100 tabular-nums">{value}</div>
                <div className="mt-1 text-xs text-stone-400">{label}</div>
              </Card>
            ))}
          </div>
          <Table
            t={t}
            title={t.byOpponent}
            rows={(["easy", "medium", "hard", "online"] as const)
              .filter((l) => stats.byOpponent.has(l))
              .map((l) => [
                l === "online" ? `🌐 ${t.online}` : `${t.computer} (${levelName[l]})`,
                stats.byOpponent.get(l)!,
              ])}
          />
          <Table
            t={t}
            title={t.byVariant}
            rows={[...stats.byVariant].map(([v, tally]) => [getVariant(v as never).name, tally])}
          />
          <Card>
            <h2 className="mb-2 font-semibold text-stone-200">{t.recentGames}</h2>
            <ul className="divide-y divide-stone-800">
              {records.slice(0, 30).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-stone-200">
                      {r.players[0].name} – {r.players[1].name}
                    </div>
                    <div className="text-xs text-stone-500">
                      {new Date(r.date).toLocaleString(t.locale)} · {getVariant(r.variant).name} ·{" "}
                      {r.players[r.result.winner].name} +{r.result.points}
                    </div>
                  </div>
                  <Button className="px-3 py-1.5 text-sm" onClick={() => onReplay(r)}>
                    ▶ {t.watch}
                  </Button>
                </li>
              ))}
            </ul>
            {stats.hotseat > 0 && (
              <p className="mt-2 text-xs text-stone-500">
                {stats.hotseat} {t.hotseatGames}
              </p>
            )}
          </Card>
          <Button variant="ghost" className="self-center text-sm" onClick={() => setConfirmClear(true)}>
            🗑 {t.clearArchive}
          </Button>
        </>
      )}

      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <p className="mb-4 text-stone-100">{t.clearArchiveConfirm}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirmClear(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              {t.clearArchive}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
