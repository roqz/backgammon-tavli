import type { AdminReport, MatchDetailResponse, ModerationInfo } from "@tavli/protocol";
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
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
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

  const load = (which: "open" | "resolved" = status) =>
    run(async () => {
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        // storage blocked: the token simply is not remembered
      }
      setReports(await adminApi<AdminReport[]>(token, `/api/admin/reports?status=${which}`));
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
              if (reports) void load(v);
            }}
            options={[
              { value: "open", label: t.adminOpen },
              { value: "resolved", label: t.adminResolved },
            ]}
          />
          <Button variant="primary" disabled={token.length < 16} onClick={() => void load()}>
            {t.adminLoad}
          </Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </Card>

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
