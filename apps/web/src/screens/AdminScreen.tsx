import type {
  AdminReport,
  AnalysisSummary,
  MatchDetailResponse,
  ModerationInfo,
  ModerationSignals,
  PublicPlayerRef,
  TimingSummary,
} from "@tavli/protocol";
import { useState } from "react";
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
  const [status, setStatus] = useState<"open" | "resolved" | "signals">("open");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [signals, setSignals] = useState<ModerationSignals | null>(null);
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

  const load = (which: "open" | "resolved" | "signals" = status) =>
    run(async () => {
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        // storage blocked: the token simply is not remembered
      }
      if (which === "signals") {
        setSignals(await adminApi<ModerationSignals>(token, "/api/admin/signals"));
        setReports(null);
      } else {
        setReports(await adminApi<AdminReport[]>(token, `/api/admin/reports?status=${which}`));
        setSignals(null);
      }
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
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">🛡 {t.adminTitle}</h1>
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
              if (reports || signals) void load(v);
            }}
            options={[
              { value: "open", label: t.adminOpen },
              { value: "resolved", label: t.adminResolved },
              { value: "signals", label: t.adminSignals },
            ]}
          />
          <Button variant="primary" disabled={token.length < 16} onClick={() => void load()}>
            {t.adminLoad}
          </Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </Card>

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
        <span className="text-xs text-stone-500">{new Date(r.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-amber-200">{reasonLabel}</p>
      {r.note && <p className="whitespace-pre-wrap text-stone-300">“{r.note}”</p>}
      <p className="text-xs text-stone-500">
        ← {r.reporter.name} · {r.reportsAgainst} {t.adminReportsAgainst}
        {r.resolution ? ` · ✓ ${r.resolution}` : ""}
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
            ▶ {t.adminMatch}
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
            ✓ {t.adminDismiss}
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
      🤖 {t.adminAgreement}: {pct(a.agreement)} · {t.adminAvgLoss}: {a.averageLoss.toFixed(3)} · {a.decisions}{" "}
      {t.adminDecisions}
    </p>
  );
}

function TimingLine({ a }: { a: TimingSummary }) {
  const t = useT();
  return (
    <p className="font-mono text-xs text-stone-400">
      ⏱ {t.adminTypicalTime}: {a.typicalSeconds.toFixed(1)} s · {t.adminSpread}: {a.spread.toFixed(2)} ·{" "}
      {a.decisions} {t.adminDecisions}
    </p>
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
        <h2 className="font-semibold text-stone-100">🤖 {t.adminBotLike}</h2>
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
        <h2 className="font-semibold text-stone-100">⏱ {t.adminSteadyTiming}</h2>
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
        <h2 className="font-semibold text-stone-100">🏳 {t.adminForfeits}</h2>
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
