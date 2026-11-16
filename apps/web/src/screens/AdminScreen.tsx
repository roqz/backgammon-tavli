import {
  type AdminReport,
  type AdminSupportOverview,
  type AnalysisSummary,
  type MatchDetailResponse,
  type ModerationInfo,
  type ModerationSignals,
  type PlayerStats,
  type PublicPlayerRef,
  SUPPORTER_LIFETIME,
  type TimingSummary,
} from "@tavli/protocol";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Button, Card, Segmented } from "../components/ui";
import { useT } from "../i18n";
import { httpUrl, useOnline } from "../online/store";
import type { GameRecord } from "../store/archive";
import { matchToRecords } from "./OnlineProfile";

const TOKEN_KEY = "tavli.admin-token";

const readToken = (): string => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

/** Calls the moderation API with the admin token (kept for this browser tab only). */
const adminApi = async <T,>(token: string, path: string, body?: object): Promise<T> => {
  const res = await fetch(httpUrl(useOnline.getState().serverUrl, path), {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Admin-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return (await res.json()) as T;
};

/**
 * Moderation (open with `?admin`): review reports, look at the match, ban or unban players.
 * Only works when the server was started with ADMIN_TOKEN.
 */
export function AdminScreen({
  onBack,
  onReplay,
}: {
  onBack: () => void;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const [token, setToken] = useState(readToken);
  const [status, setStatus] = useState<"open" | "resolved" | "signals" | "stats" | "support">("open");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [signals, setSignals] = useState<ModerationSignals | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [support, setSupport] = useState<AdminSupportOverview | null>(null);
  const supportEnabled = useOnline((s) => s.supportEnabled);
  const [players, setPlayers] = useState<Record<string, ModerationInfo>>({});
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const load = (which: "open" | "resolved" | "signals" | "stats" | "support" = status) =>
    run(async () => {
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        // storage blocked: the token simply is not remembered
      }
      setReports(null);
      setSignals(null);
      setStats(null);
      setSupport(null);
      if (which === "support")
        setSupport(await adminApi<AdminSupportOverview>(token, "/api/admin/supporters"));
      else if (which === "signals")
        setSignals(await adminApi<ModerationSignals>(token, "/api/admin/signals"));
      else if (which === "stats") setStats(await adminApi<PlayerStats>(token, "/api/admin/stats"));
      else setReports(await adminApi<AdminReport[]>(token, `/api/admin/reports?status=${which}`));
    });

  const inspect = (id: string) =>
    run(async () => {
      const info = await adminApi<ModerationInfo>(token, `/api/admin/players/${id}`);
      setPlayers((p) => ({ ...p, [id]: info }));
    });

  const ban = (id: string, reason: string | null) =>
    run(async () => {
      const info = await adminApi<ModerationInfo>(token, `/api/admin/players/${id}/ban`, { reason });
      setPlayers((p) => ({ ...p, [id]: info }));
      await load();
    });

  const resolve = (r: AdminReport, resolution: string) =>
    run(async () => {
      await adminApi(token, `/api/admin/reports/${r.id}/resolve`, { resolution });
      await load();
    });

  const openMatch = (matchId: string) =>
    run(async () => {
      const res = await fetch(httpUrl(useOnline.getState().serverUrl, `/api/matches/${matchId}`));
      if (!res.ok) throw new Error(res.statusText);
      onReplay(matchToRecords((await res.json()) as MatchDetailResponse, undefined));
    });

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          <Icon name="back" label={t.back} />
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">
          <Icon name="shield" /> {t.adminTitle}
        </h1>
      </div>
      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-stone-400">
          {t.adminToken}
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
          />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Segmented
            label=""
            value={status}
            onChange={(v) => {
              setStatus(v);
              if (reports || signals || stats || support) void load(v);
            }}
            options={[
              { value: "open", label: t.adminOpen },
              { value: "resolved", label: t.adminResolved },
              { value: "signals", label: t.adminSignals },
              { value: "stats", label: t.adminStats },
              ...(supportEnabled ? [{ value: "support" as const, label: t.adminSupport }] : []),
            ]}
          />
          <Button variant="primary" disabled={token.length < 16} onClick={() => void load()}>
            {t.adminLoad}
          </Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </Card>

      {stats && <StatsView stats={stats} />}
      {support && <SupportView overview={support} token={token} onChange={setSupport} />}
      {signals && (
        <SignalsView
          signals={signals}
          players={players}
          onInspect={(id) => void inspect(id)}
          onBan={(id, reason) => void ban(id, reason)}
        />
      )}
      {reports?.length === 0 && <p className="text-center text-stone-500">{t.adminNone}</p>}
      {reports?.map((r) => (
        <ReportCard
          key={r.id}
          report={r}
          info={players[r.reported.id]}
          onInspect={() => void inspect(r.reported.id)}
          onBan={(reason) => void ban(r.reported.id, reason)}
          onResolve={(resolution) => void resolve(r, resolution)}
          onMatch={r.matchId ? () => void openMatch(r.matchId!) : undefined}
        />
      ))}
    </div>
  );
}

function ReportCard({
  report: r,
  info,
  onInspect,
  onBan,
  onResolve,
  onMatch,
}: {
  report: AdminReport;
  info: ModerationInfo | undefined;
  onInspect: () => void;
  onBan: (reason: string | null) => void;
  onResolve: (resolution: string) => void;
  onMatch?: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState(r.reason);
  const banned = info ? info.bannedAt !== null : r.reported.banned;
  const reasonLabel = (t.reportReason as Record<string, string>)[r.reason] ?? r.reason;
  return (
    <Card className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          className="text-lg font-semibold text-stone-100 hover:text-amber-200"
          onClick={onInspect}
        >
          {r.reported.name}
          {banned && (
            <span className="ml-2 rounded bg-red-900 px-1.5 py-0.5 text-xs text-red-100">
              {t.adminBanned}
            </span>
          )}
        </button>
        <span className="text-xs text-stone-500">{new Date(r.createdAt).toLocaleString(t.locale)}</span>
      </div>
      <p className="text-amber-200">{reasonLabel}</p>
      {r.note && <p className="whitespace-pre-wrap text-stone-300">“{r.note}”</p>}
      <p className="text-xs text-stone-500">
        ← {r.reporter.name} · {r.reportsAgainst} {t.adminReportsAgainst}
        {r.resolution && (
          <>
            {" · "}
            <Icon name="check" /> {r.resolution}
          </>
        )}
      </p>
      {info && (
        <p className="font-mono text-xs text-stone-400">
          {info.username ?? "guest"} · {info.matches} matches · {info.forfeits} forfeits · {info.reportsFiled}{" "}
          filed
          {info.banReason ? ` · ban: ${info.banReason}` : ""}
        </p>
      )}
      {info?.analysis && <AnalysisLine a={info.analysis} />}
      {info?.timing && <TimingLine a={info.timing} />}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {onMatch && (
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={onMatch}>
            <Icon name="play" /> {t.adminMatch}
          </Button>
        )}
        {banned ? (
          <Button className="px-3 py-1.5 text-sm" onClick={() => onBan(null)}>
            {t.adminUnban}
          </Button>
        ) : (
          <>
            <input
              aria-label={t.adminBanReason}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1.5 text-stone-100"
            />
            <Button
              variant="danger"
              className="px-3 py-1.5 text-sm"
              disabled={!reason.trim()}
              onClick={() => onBan(reason.trim())}
            >
              {t.adminBan}
            </Button>
          </>
        )}
        {!r.resolvedAt && (
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-sm"
            onClick={() => onResolve(banned ? "banned" : "no action")}
          >
            <Icon name="check" /> {t.adminDismiss}
          </Button>
        )}
      </div>
    </Card>
  );
}

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;

function AnalysisLine({ a }: { a: AnalysisSummary }) {
  const t = useT();
  return (
    <p className="font-mono text-xs text-stone-400">
      <Icon name="robot" /> {t.adminAgreement}: {pct(a.agreement)} · {t.adminAvgLoss}:{" "}
      {a.averageLoss.toFixed(3)} · {a.decisions} {t.adminDecisions}
    </p>
  );
}

function TimingLine({ a }: { a: TimingSummary }) {
  const t = useT();
  return (
    <p className="font-mono text-xs text-stone-400">
      <Icon name="clock" /> {t.adminTypicalTime}: {a.typicalSeconds.toFixed(1)} s · {t.adminSpread}:{" "}
      {a.spread.toFixed(2)} · {a.decisions} {t.adminDecisions}
    </p>
  );
}

/** Player numbers: online now, totals, active and new players per period. */
function StatsView({ stats }: { stats: PlayerStats }) {
  const t = useT();
  const tile = (label: string, value: number) => (
    <div key={label} className="rounded-xl bg-stone-800/70 p-3 text-center">
      <div className="text-2xl font-bold text-amber-100 tabular-nums">{value}</div>
      <div className="text-xs text-stone-400">{label}</div>
    </div>
  );
  const periods = (counts: PlayerStats["active"]) => [counts.d1, counts.d7, counts.d30];
  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {tile(t.adminOnlineNow, stats.online)}
        {tile(t.adminPlaying, stats.playing)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tile(t.adminTotal, stats.total)}
        {tile(t.adminRegistered, stats.registered)}
        {tile(t.adminGuests, stats.guests)}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-stone-400">
            <th className="text-left font-medium" />
            {t.adminPeriods.map((p) => (
              <th key={p} className="text-right font-medium">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums text-stone-100">
          {(
            [
              [t.adminActive, stats.active],
              [t.adminCreated, stats.created],
            ] as const
          ).map(([label, counts]) => (
            <tr key={label} className="border-t border-stone-800">
              <th className="py-2 text-left font-medium text-stone-300">{label}</th>
              {periods(counts).map((n, i) => (
                <td key={t.adminPeriods[i]} className="py-2 text-right">
                  {n}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Fair-play signals: hints for moderators, never automatic penalties. */
function SignalsView({
  signals: s,
  players,
  onInspect,
  onBan,
}: {
  signals: ModerationSignals;
  players: Record<string, ModerationInfo>;
  onInspect: (id: string) => void;
  onBan: (id: string, reason: string | null) => void;
}) {
  const t = useT();
  const th = s.thresholds;
  const person = (p: PublicPlayerRef, reason: string) => (
    <PlayerLine player={p} info={players[p.id]} reason={reason} onInspect={onInspect} onBan={onBan} />
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-stone-500">{t.adminSignalsHint.replace("{days}", String(th.days))}</p>
      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold text-stone-100">
          <Icon name="robot" /> {t.adminBotLike}
        </h2>
        <p className="text-xs text-stone-500">
          ≥ {pct(th.botLikeAgreement)} · ≥ {th.botLikeDecisions} {t.adminDecisions}
        </p>
        {s.botLike.length === 0 && <p className="text-stone-500">—</p>}
        {s.botLike.map((x) => (
          <div key={x.player.id}>
            {person(x.player, t.adminBotLike)}
            <AnalysisLine a={x} />
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold text-stone-100">
          <Icon name="clock" /> {t.adminSteadyTiming}
        </h2>
        <p className="text-xs text-stone-500">
          {t.adminSteadyTimingHint
            .replace("{spread}", th.timingSpread.toFixed(2))
            .replace("{n}", String(th.timingDecisions))}
        </p>
        {s.steadyTiming.length === 0 && <p className="text-stone-500">—</p>}
        {s.steadyTiming.map((x) => (
          <div key={x.player.id}>
            {person(x.player, t.adminSteadyTiming)}
            <TimingLine a={x} />
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold text-stone-100">
          <Icon name="flag" /> {t.adminForfeits}
        </h2>
        <p className="text-xs text-stone-500">
          ≥ {pct(th.forfeitRate)} · ≥ {th.forfeitMatches} Matches
        </p>
        {s.forfeits.length === 0 && <p className="text-stone-500">—</p>}
        {s.forfeits.map((x) => (
          <div key={x.player.id}>
            {person(x.player, t.adminForfeits)}
            <p className="font-mono text-xs text-stone-400">
              {x.forfeits} / {x.matches}
            </p>
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold text-stone-100">🤝 {t.adminDumping}</h2>
        <p className="text-xs text-stone-500">
          {t.adminDumpingHint.replace("{n}", String(th.dumpingMatches))}
        </p>
        {s.dumping.length === 0 && <p className="text-stone-500">—</p>}
        {s.dumping.map((x) => (
          <div key={`${x.loser.id}-${x.winner.id}`} className="flex flex-col gap-1">
            <p className="text-stone-300">
              {x.loser.name} → {x.winner.name}: {x.matches}×
            </p>
            {person(x.loser, t.adminDumping)}
            {person(x.winner, t.adminDumping)}
          </div>
        ))}
      </Card>
    </div>
  );
}

function PlayerLine({
  player,
  info,
  reason,
  onInspect,
  onBan,
}: {
  player: PublicPlayerRef;
  info: ModerationInfo | undefined;
  reason: string;
  onInspect: (id: string) => void;
  onBan: (id: string, reason: string | null) => void;
}) {
  const t = useT();
  const banned = info ? info.bannedAt !== null : player.banned;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="font-semibold text-stone-100 hover:text-amber-200"
        onClick={() => onInspect(player.id)}
      >
        {player.name}
      </button>
      {banned && (
        <span className="rounded bg-red-900 px-1.5 py-0.5 text-xs text-red-100">{t.adminBanned}</span>
      )}
      {info && (
        <span className="font-mono text-xs text-stone-500">
          {info.matches} matches · {info.forfeits} forfeits · {info.reportsAgainst} reports
        </span>
      )}
      <Button
        variant={banned ? "secondary" : "danger"}
        className="ml-auto px-2 py-1 text-xs"
        onClick={() => onBan(player.id, banned ? null : reason)}
      >
        {banned ? t.adminUnban : t.adminBan}
      </Button>
    </div>
  );
}

const SUPPORT_MONTHS = [1, 3, 6, 12, 0] as const;

/** Supporters: grant by hand, end, create one-time codes for donors. */
function SupportView({
  overview,
  token,
  onChange,
}: {
  overview: AdminSupportOverview;
  token: string;
  onChange: (o: AdminSupportOverview) => void;
}) {
  const t = useT();
  const [player, setPlayer] = useState("");
  const [months, setMonths] = useState<number>(12);
  const [note, setNote] = useState("");
  const [count, setCount] = useState(5);
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field =
    "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400";
  const monthsLabel = (m: number) => (m === 0 ? t.adminLifetime : t.adminMonthsN.replace("{n}", String(m)));
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const date = (iso: string) =>
    iso === SUPPORTER_LIFETIME ? t.adminLifetime : new Date(iso).toLocaleDateString(t.locale);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-stone-100">
          <Icon name="heart" className="h-[1.15em] w-[1.15em] text-brass" /> {t.adminGrant}
        </h2>
        <input
          className={field}
          placeholder={t.adminGrantPlayer}
          aria-label={t.adminGrantPlayer}
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <select
            className={field}
            aria-label={t.adminMonths}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {SUPPORT_MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthsLabel(m)}
              </option>
            ))}
          </select>
          <input
            className={`${field} min-w-0 flex-1`}
            placeholder={t.adminNote}
            aria-label={t.adminNote}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!player.trim()}
            onClick={() =>
              void run(async () => {
                onChange(
                  await adminApi<AdminSupportOverview>(token, "/api/admin/supporters", {
                    player: player.trim(),
                    months,
                    note,
                  }),
                );
                setPlayer("");
              })
            }
          >
            {t.adminGrant}
          </Button>
          <span className="flex items-center gap-2 text-sm text-stone-400">
            {t.adminCodeCount}
            <input
              type="number"
              min={1}
              max={50}
              className={`${field} w-20`}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </span>
          <Button
            onClick={() =>
              void run(async () => {
                const r = await adminApi<{ codes: string[] }>(token, "/api/admin/supporter-codes", {
                  count,
                  months,
                  note,
                });
                setCodes(r.codes);
                onChange(await adminApi<AdminSupportOverview>(token, "/api/admin/supporters"));
              })
            }
          >
            {t.adminCodes} ({monthsLabel(months)})
          </Button>
        </div>
        {codes && (
          <div className="rounded-lg border border-brass/40 bg-stone-950 p-3">
            <p className="mb-2 text-sm text-amber-200">{t.adminCodesNew}</p>
            <pre className="select-all whitespace-pre-wrap font-mono text-sm text-stone-100">
              {codes.join("\n")}
            </pre>
          </div>
        )}
        <p className="text-xs text-stone-500">
          {t.adminOpenCodes.replace("{n}", String(overview.openCodes.length))}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </Card>
      {overview.supporters.length === 0 ? (
        <p className="text-center text-stone-500">{t.adminNoSupporters}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-800" data-testid="admin-supporters">
            {overview.supporters.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Icon name="heart" className={`h-4 w-4 ${s.active ? "text-brass" : "text-stone-600"}`} />
                  <span className="min-w-0 flex-1 truncate text-stone-100">
                    {s.name}
                    {s.username && <span className="text-stone-500"> · {s.username}</span>}
                  </span>
                  <span className={`text-xs ${s.active ? "text-emerald-300" : "text-stone-500"}`}>
                    {s.active ? t.adminActive : t.adminExpired} · {date(s.since)} – {date(s.until)}
                  </span>
                  {s.active && (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() =>
                        void run(async () =>
                          onChange(
                            await adminApi<AdminSupportOverview>(token, "/api/admin/supporters/revoke", {
                              playerId: s.id,
                            }),
                          ),
                        )
                      }
                    >
                      {t.adminRevoke}
                    </Button>
                  )}
                </div>
                {s.grants.length > 0 && (
                  <p className="pl-5 text-xs text-stone-500">
                    {s.grants
                      .map(
                        (g) =>
                          `${new Date(g.at).toLocaleDateString(t.locale)}: ${monthsLabel(g.months)} (${g.source}${g.note ? `, ${g.note}` : ""})`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
