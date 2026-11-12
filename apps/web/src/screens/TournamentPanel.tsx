import { getVariant } from "@tavli/engine";
import {
  MATCH_VARIANTS,
  type MatchVariantId,
  TOURNAMENT_FORMATS,
  TOURNAMENT_NAME_MAX,
  type TournamentFormat,
  type TournamentMatchView,
  type TournamentView,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { Button, Card, Segmented } from "../components/ui";
import { useT } from "../i18n";
import {
  createTournament,
  fetchMatch,
  fetchTournaments,
  joinTournament,
  leaveTournament,
  type MatchLength,
} from "../online/client";
import { useOnline } from "../online/store";
import type { GameRecord } from "../store/archive";
import { matchToRecords } from "./OnlineProfile";

type T = ReturnType<typeof useT>;

const REFRESH_MS = 5_000;

/** Knockout: "Final", "Semi-final", … counted from the last round; Swiss: "Round 2/3". */
export const roundName = (
  t: T,
  round: number,
  rounds: number,
  format: TournamentFormat = "knockout",
): string => {
  if (format === "swiss") return t.tRound.replace("{n}", String(round + 1)).replace("{of}", String(rounds));
  const fromEnd = rounds - 1 - round;
  return [t.tRounds.final, t.tRounds.semi, t.tRounds.quarter, t.tRounds.r16][fromEnd] ?? `${round + 1}`;
};

const variantLabel = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

/**
 * Tournaments: open ones to join, running and recent ones with their bracket. The list is
 * refreshed from the server; tournaments the player is in are also pushed over the connection.
 */
export function TournamentPanel({
  focus,
  onReplay,
}: {
  /** Tournament to show expanded (e.g. coming back from a tournament match). */
  focus?: string | null;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const { profile, status, tournaments: pushed, lastError } = useOnline();
  const [list, setList] = useState<TournamentView[]>([]);
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchTournaments()
        .then((l) => alive && setList(l))
        .catch(() => {});
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Pushed updates are newer than the last list fetch.
  const merged = list.map((x) => pushed[x.id] ?? x);
  for (const v of Object.values(pushed))
    if (!merged.some((x) => x.id === v.id) && (v.status === "open" || v.status === "running"))
      merged.unshift(v);

  const me = profile?.id;
  const mine = merged.find((x) => isActive(x, me));

  return (
    <div className="flex flex-col gap-4">
      {lastError && <p className="text-center text-sm text-red-400">{lastError}</p>}
      {!mine && (
        <Card className="flex flex-col gap-3">
          {creating ? (
            <CreateForm onDone={() => setCreating(false)} disabled={status !== "ready"} />
          ) : (
            <Button variant="primary" disabled={status !== "ready"} onClick={() => setCreating(true)}>
              🏆 {t.tCreate}
            </Button>
          )}
        </Card>
      )}
      {mine && <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{t.tKeepOpen}</p>}
      {merged.length === 0 && <p className="text-center text-stone-500">{t.tNone}</p>}
      {merged.map((x) => (
        <TournamentCard
          key={x.id}
          tournament={x}
          me={me}
          expanded={open === x.id || x.id === mine?.id}
          onToggle={() => setOpen(open === x.id ? null : x.id)}
          canJoin={!mine && status === "ready"}
          onReplay={onReplay}
        />
      ))}
    </div>
  );
}

/** Still taking part: entered, not withdrawn and (knockout) not knocked out. */
const isActive = (x: TournamentView, me: string | undefined): boolean => {
  if (!me || (x.status !== "open" && x.status !== "running")) return false;
  const p = x.players.find((pl) => pl.id === me);
  if (!p || p.withdrawn) return false;
  if (x.format === "swiss") return true;
  return !x.rounds.flat().some((m) => m.status === "done" && m.players.includes(me) && m.winner !== me);
};

function CreateForm({ onDone, disabled }: { onDone: () => void; disabled: boolean }) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const [name, setName] = useState(t.tDefaultName.replace("{name}", profile?.name ?? ""));
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(3);
  const [size, setSize] = useState<4 | 8 | 16>(8);
  const [format, setFormat] = useState<TournamentFormat>("knockout");
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label={t.tFormat}
        value={format}
        onChange={setFormat}
        options={TOURNAMENT_FORMATS.map((f) => ({ value: f, label: t.tFormats[f] }))}
      />
      <p className="text-xs text-stone-400">
        {t.tFormatHint[format]} {t.tCreateHint}
      </p>
      <label className="flex flex-col gap-1 text-sm text-stone-400">
        {t.tName}
        <input
          value={name}
          maxLength={TOURNAMENT_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
        />
      </label>
      <Segmented
        label={t.variant}
        value={variant}
        onChange={setVariant}
        options={MATCH_VARIANTS.map((v) => ({ value: v, label: variantLabel(v, t.tavliMatch) }))}
      />
      <Segmented
        label={t.matchLength}
        value={length}
        onChange={setLength}
        options={([1, 3, 5, 7] as const).map((l) => ({ value: l, label: String(l) }))}
      />
      <Segmented
        label={t.tSize}
        value={size}
        onChange={setSize}
        options={([4, 8, 16] as const).map((n) => ({ value: n, label: String(n) }))}
      />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onDone}>
          {t.cancel}
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={disabled || !name.trim()}
          onClick={() => {
            createTournament(name.trim(), variant, length, size, format);
            onDone();
          }}
        >
          🏆 {t.tCreate}
        </Button>
      </div>
    </div>
  );
}

function TournamentCard({
  tournament: x,
  me,
  expanded,
  onToggle,
  canJoin,
  onReplay,
}: {
  tournament: TournamentView;
  me: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  canJoin: boolean;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const entered = !!me && x.players.some((p) => p.id === me);
  const active = isActive(x, me);
  const myMatch = me
    ? x.rounds.flat().find((m) => m.players.includes(me) && (m.status === "ready" || m.status === "playing"))
    : undefined;
  const winner = x.players.find((p) => p.id === x.winner);
  const badge = {
    open: "bg-emerald-500/20 text-emerald-300",
    running: "bg-amber-500/20 text-amber-300",
    finished: "bg-stone-700 text-stone-300",
    cancelled: "bg-stone-800 text-stone-500",
  }[x.status];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-stone-100">🏆 {x.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ${badge}`}>{t.tStatus[x.status]}</span>
      </div>
      <p className="text-sm text-stone-400">
        {t.tFormats[x.format]} · {variantLabel(x.variant, t.tavliMatch)} · {x.length}{" "}
        {x.length === 1 ? t.point : t.points} ·{" "}
        {t.tPlayers.replace("{n}", String(x.players.length)).replace("{size}", String(x.size))}
      </p>
      {winner && (
        <p className="text-amber-200">
          🥇 {t.tWinner}: <b>{winner.name}</b>
        </p>
      )}
      {x.status === "open" && (
        <p className="text-sm text-stone-300">
          {x.players.map((p) => (p.id === me ? `${p.name} (${t.tYou})` : p.name)).join(", ")}
        </p>
      )}
      {x.status === "open" && entered && <p className="text-xs text-stone-500">{t.tWaitingPlayers}</p>}
      {myMatch?.status === "ready" && (
        <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-200">{t.tYourMatch}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {x.status === "open" && !entered && (
          <Button variant="primary" disabled={!canJoin} onClick={() => joinTournament(x.id)}>
            {t.tJoin}
          </Button>
        )}
        {active && (
          <Button variant="ghost" className="text-red-300" onClick={() => leaveTournament(x.id)}>
            {x.status === "open" ? t.tLeave : t.tWithdraw}
          </Button>
        )}
        {x.status !== "open" && x.rounds.length > 0 && (
          <Button variant="ghost" onClick={onToggle}>
            {expanded ? t.tHide : t.tShow}
          </Button>
        )}
      </div>
      {expanded && x.standings && <Standings tournament={x} me={me} />}
      {expanded && x.rounds.length > 0 && <Bracket tournament={x} me={me} onReplay={onReplay} />}
    </Card>
  );
}

function Bracket({
  tournament: x,
  me,
  onReplay,
}: {
  tournament: TournamentView;
  me: string | undefined;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  return (
    <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1" data-testid="bracket">
      {x.rounds.map((round, r) => (
        <div
          key={round[0]?.round ?? `r${x.rounds.length}`}
          className="flex min-w-36 flex-1 flex-col justify-around gap-2"
        >
          <h4 className="text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
            {roundName(t, r, x.roundCount, x.format)}
          </h4>
          {round.map((m) => (
            <MatchBox key={m.slot} m={m} tournament={x} me={me} onReplay={onReplay} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MatchBox({
  m,
  tournament: x,
  me,
  onReplay,
}: {
  m: TournamentMatchView;
  tournament: TournamentView;
  me: string | undefined;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const player = (id: string | null) => x.players.find((p) => p.id === id);
  const replay = async () => {
    if (!m.matchId) return;
    try {
      onReplay(matchToRecords(await fetchMatch(m.matchId), me));
    } catch {
      // the match may not be stored yet
    }
  };
  const status =
    m.status === "playing"
      ? t.tPlaying
      : m.status === "ready"
        ? t.tReady
        : m.walkover
          ? m.players[1] === null
            ? t.tBye
            : t.tWalkover
          : null;
  return (
    <button
      type="button"
      disabled={m.status !== "done" || !m.matchId}
      onClick={() => void replay()}
      className="rounded-lg border border-stone-700 bg-stone-800/60 px-2 py-1.5 text-left text-xs enabled:hover:border-amber-400/60"
    >
      {([0, 1] as const).map((side) => {
        const p = player(m.players[side]);
        const won = m.winner !== null && m.winner === m.players[side];
        return (
          <div
            key={side}
            className={`flex items-center justify-between gap-2 ${won ? "font-bold text-amber-200" : m.winner ? "text-stone-500" : "text-stone-200"}`}
          >
            <span className="truncate">
              {p ? `${p.seed ? `${p.seed}. ` : ""}${p.name}${p.id === me ? ` (${t.tYou})` : ""}` : "—"}
              {p?.withdrawn && <span className="ml-1 text-stone-500">({t.tWithdrawn})</span>}
            </span>
            {m.score && <span className="tabular-nums">{m.score[side]}</span>}
          </div>
        );
      })}
      {status && <div className="mt-0.5 text-[10px] uppercase tracking-wide text-stone-500">{status}</div>}
    </button>
  );
}

/** Swiss table: wins, Buchholz, matches played. */
function Standings({ tournament: x, me }: { tournament: TournamentView; me: string | undefined }) {
  const t = useT();
  const name = (id: string) => x.players.find((p) => p.id === id);
  return (
    <table className="w-full text-sm" data-testid="standings">
      <caption className="pb-1 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
        {t.tStandings}
      </caption>
      <thead>
        <tr className="text-xs text-stone-500">
          <th className="w-6 text-left font-normal">#</th>
          <th className="text-left font-normal">{t.tName}</th>
          <th className="w-12 text-right font-normal">{t.tWins}</th>
          <th className="w-16 text-right font-normal">{t.tBuchholz}</th>
          <th className="w-8 text-right font-normal">{t.tPlayed}</th>
        </tr>
      </thead>
      <tbody>
        {(x.standings ?? []).map((r, i) => {
          const p = name(r.id);
          return (
            <tr key={r.id} className={r.id === me ? "text-amber-200" : "text-stone-200"}>
              <td className="tabular-nums text-stone-500">{i + 1}</td>
              <td className="truncate">
                {p?.name ?? "?"}
                {r.id === me && ` (${t.tYou})`}
                {p?.withdrawn && <span className="ml-1 text-stone-500">({t.tWithdrawn})</span>}
              </td>
              <td className="text-right font-semibold tabular-nums">{r.wins}</td>
              <td className="text-right tabular-nums text-stone-400">{r.buchholz}</td>
              <td className="text-right tabular-nums text-stone-400">{r.played}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
