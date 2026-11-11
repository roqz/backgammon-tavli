import { getVariant } from "@tavli/engine";
import {
  type LeaderboardEntry,
  MATCH_VARIANTS,
  type MatchVariantId,
  type RatingEntry,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { Button, Card, Segmented } from "../components/ui";
import { useT } from "../i18n";
import {
  connect,
  createInvite,
  fetchLeaderboard,
  fetchProfile,
  joinInvite,
  type MatchLength,
  queue,
  syncAccount,
  unqueue,
} from "../online/client";
import { useOnline } from "../online/store";
import type { GameRecord } from "../store/archive";
import { AuthForm, PlayerSheet, ProfileTab } from "./OnlineProfile";

const variantName = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`;

function StatusPill() {
  const t = useT();
  const status = useOnline((s) => s.status);
  const color = {
    ready: "bg-emerald-500",
    connecting: "bg-amber-400 animate-pulse",
    reconnecting: "bg-amber-400 animate-pulse",
    offline: "bg-stone-500",
  }[status];
  const label = {
    ready: t.connected,
    connecting: t.connecting,
    reconnecting: t.reconnecting,
    offline: t.offline,
  }[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-stone-800 px-3 py-1 text-xs text-stone-300">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function PlayPanel() {
  const t = useT();
  const { lobby, status, lastError } = useOnline();
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(5);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const ready = status === "ready";

  if (lobby.kind === "queued") {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-stone-700 border-t-amber-400" />
        <p className="text-lg text-stone-100">{t.searching}</p>
        <p className="text-sm text-stone-400">
          {variantName(lobby.variant, t.tavliMatch)} · {lobby.length} {t.points}
        </p>
        <Button onClick={() => unqueue()}>{t.cancel}</Button>
      </Card>
    );
  }
  if (lobby.kind === "invite") {
    const link = inviteLink(lobby.code);
    return (
      <Card className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-stone-400">{t.inviteCode}</p>
        <p className="font-mono text-4xl font-bold tracking-[0.3em] text-amber-200">{lobby.code}</p>
        <p className="text-sm text-stone-400">
          {variantName(lobby.variant, t.tavliMatch)} · {lobby.length} {t.points}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: t.appTitle, url: link }).catch(() => {});
              else {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }
            }}
          >
            🔗 {copied ? t.linkCopied : t.copyLink}
          </Button>
          <Button onClick={() => unqueue()}>{t.cancel}</Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          {t.waitingForFriend}
        </p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-5">
        <Segmented
          label={t.variant}
          value={variant}
          onChange={setVariant}
          options={MATCH_VARIANTS.map((v) => ({ value: v, label: variantName(v, t.tavliMatch) }))}
        />
        <Segmented
          label={t.matchLength}
          value={length}
          onChange={setLength}
          options={([1, 3, 5, 7] as const).map((l) => ({ value: l, label: String(l) }))}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" className="py-3" disabled={!ready} onClick={() => queue(variant, length)}>
            ⚔ {t.findOpponent}
          </Button>
          <Button className="py-3" disabled={!ready} onClick={() => createInvite(variant, length)}>
            ✉ {t.inviteFriend}
          </Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-2">
        <span className="text-sm text-stone-400">{t.joinWithCode}</span>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono uppercase tracking-widest text-stone-100 outline-none focus:border-amber-400"
            value={code}
            maxLength={6}
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button disabled={code.length < 6 || !ready} onClick={() => joinInvite(code)}>
            {t.join}
          </Button>
        </div>
      </Card>
      {lastError && (
        <p className="text-center text-sm text-red-400">{lastError === "banned" ? t.banned : lastError}</p>
      )}
    </div>
  );
}

function LeaderboardPanel({ onReplay }: { onReplay: (records: GameRecord[]) => void }) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [mine, setMine] = useState<RatingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    fetchLeaderboard(variant)
      .then(setRows)
      .catch((e: unknown) => setError(String(e)));
  }, [variant]);
  useEffect(() => {
    if (profile)
      fetchProfile(profile.id)
        .then((p) => setMine([...p.ratings]))
        .catch(() => {});
  }, [profile]);

  return (
    <div className="flex flex-col gap-4">
      {mine.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mine.map((r) => (
            <Card key={r.variant} className="!p-3 text-center">
              <div className="text-2xl font-bold text-amber-100 tabular-nums">{r.rating}</div>
              <div className="text-xs text-stone-400">
                {variantName(r.variant, t.tavliMatch)} · {r.wins}/{r.matches}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <Segmented
          label={t.leaderboard}
          value={variant}
          onChange={setVariant}
          options={MATCH_VARIANTS.map((v) => ({ value: v, label: variantName(v, t.tavliMatch) }))}
        />
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {rows && rows.length === 0 && <p className="mt-3 text-sm text-stone-500">{t.noRanking}</p>}
        {rows && rows.length > 0 && (
          <ol className="mt-3 divide-y divide-stone-800 text-sm">
            {rows.map((r, i) => (
              <li key={r.playerId}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`flex w-full items-center gap-3 rounded py-2 text-left hover:bg-stone-800/60 ${r.playerId === profile?.id ? "text-amber-200" : "text-stone-200"}`}
                >
                  <span className="w-6 text-right text-stone-500 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.name} {r.playerId === profile?.id && t.you2}
                  </span>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {r.wins}/{r.matches}
                  </span>
                  <span className="w-12 text-right font-semibold tabular-nums">{r.rating}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {selected && (
        <PlayerSheet
          playerId={selected.playerId}
          name={selected.name}
          onClose={() => setSelected(null)}
          onReplay={onReplay}
        />
      )}
    </div>
  );
}

export function OnlineScreen({
  onBack,
  onReplay,
}: {
  onBack: () => void;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const { profile, serverUrl } = useOnline();
  const [tab, setTab] = useState<"play" | "ranking" | "profile">("play");

  // Connect and refresh account data once per profile (not on every profile field change).
  const profileId = profile?.id;
  useEffect(() => {
    if (profileId && serverUrl) {
      connect();
      syncAccount().catch(() => {});
    }
  }, [profileId, serverUrl]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          ←
        </Button>
        <h1 className="flex-1 text-2xl font-bold text-amber-100">{t.online}</h1>
        {profile && <StatusPill />}
      </div>
      {!serverUrl ? (
        <Card>
          <p className="text-stone-300">{t.noServer}</p>
        </Card>
      ) : !profile ? (
        <AuthForm />
      ) : (
        <>
          <p className="text-sm text-stone-400">
            👤 <span className="text-stone-200">{profile.name}</span>
          </p>
          <Segmented
            label=""
            value={tab}
            onChange={setTab}
            options={[
              { value: "play", label: t.playTab },
              { value: "ranking", label: t.leaderboard },
              { value: "profile", label: t.profileTab },
            ]}
          />
          {tab === "play" && <PlayPanel />}
          {tab === "ranking" && <LeaderboardPanel onReplay={onReplay} />}
          {tab === "profile" && <ProfileTab onReplay={onReplay} />}
        </>
      )}
    </div>
  );
}
