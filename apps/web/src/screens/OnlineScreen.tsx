import { getVariant } from "@tavli/engine";
import {
  type ActiveBoard,
  type Frame,
  MATCH_VARIANTS,
  type MatchVariantId,
  type MonthBoard,
  RATING_POOLS,
  type RatingEntry,
  type RatingPool,
  type TimeControl,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Plaque } from "../components/Medallion";
import { PlayerName } from "../components/PlayerName";
import { SetupLayout } from "../components/Setup";
import { TimeControlPicker } from "../components/TimeControlPicker";
import { Button, Card, Segmented, Tabs } from "../components/ui";
import { Choice, VariantPicker } from "../components/VariantPicker";
import { errorOf, errorText } from "../errors";
import { lengthText, useT } from "../i18n";
import {
  connect,
  createInvite,
  fetchActiveBoard,
  fetchLeaderboard,
  fetchMonthBoard,
  fetchProfile,
  joinInvite,
  type MatchLength,
  queue,
  syncAccount,
  unqueue,
} from "../online/client";
import { useOnlinePlayers } from "../online/presence";
import { useOnline } from "../online/store";
import type { Todo } from "../online/todo";
import type { GameRecord } from "../store/archive";
import { ActionCard, CountBadge, GLYPH, Glyph, Page, ScreenTitle, SectionTitle } from "./AppShell";
import { ClubsPanel } from "./ClubsPanel";
import { CorrPanel } from "./CorrScreens";
import { FriendsPanel, LivePanel } from "./FriendsPanel";
import { AuthForm, PlayerSheet, ProfileTab } from "./OnlineProfile";
import { TournamentPanel } from "./TournamentPanel";

const variantName = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`;

export function StatusPill() {
  const t = useT();
  const status = useOnline((s) => s.status);
  const players = useOnlinePlayers();
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
      {status === "ready" && players !== null && (
        <span className="text-stone-400">· {t.playersOnline.replace("{n}", String(players))}</span>
      )}
    </span>
  );
}

/** Live online match: search an opponent, invite a friend by link or join with a code. */
export function PlayPanel() {
  const t = useT();
  const { lobby, status, lastError } = useOnline();
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(5);
  const [clock, setClock] = useState<TimeControl>("relaxed");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const ready = status === "ready";

  if (lobby.kind === "queued") {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-stone-700 border-t-amber-400" />
        <p className="text-lg text-stone-100">{t.searching}</p>
        <p className="text-sm text-stone-400">
          {variantName(lobby.variant, t.tavliMatch)} · {lengthText(t, lobby.length)}
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
          {variantName(lobby.variant, t.tavliMatch)} · {lengthText(t, lobby.length)}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: t.appTitle, url: link }).catch(() => {});
              else {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopyFailed(true);
                }
              }
            }}
          >
            <Icon name="link" /> {copied ? t.linkCopied : t.copyLink}
          </Button>
          <Button onClick={() => unqueue()}>{t.cancel}</Button>
        </div>
        {copyFailed && (
          <p className="text-xs text-stone-400">
            {t.copyFailed} <span className="select-all break-all font-mono text-stone-200">{link}</span>
          </p>
        )}
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          {t.waitingForFriend}
        </p>
      </Card>
    );
  }
  return (
    <SetupLayout
      variant={variant}
      summary={`${variantName(variant, t.tavliMatch)} · ${lengthText(t, length)}`}
      action={{
        label: t.findOpponent,
        disabled: !ready,
        onClick: () => queue(variant, length, clock),
      }}
      secondary={
        <Button disabled={!ready} onClick={() => createInvite(variant, length, clock)}>
          <Icon name="mail" /> {t.inviteFriend}
        </Button>
      }
    >
      <VariantPicker value={variant} onChange={setVariant} variants={MATCH_VARIANTS} />
      <Choice
        label={t.matchLength}
        value={length}
        onChange={setLength}
        options={([0, 1, 3, 5, 7] as const).map((l) => ({
          value: l,
          label: l === 0 ? t.money : String(l),
        }))}
      />
      {length === 0 && <p className="-mt-4 text-xs text-stone-400">{t.moneyHint}</p>}
      {length === 1 && variant !== "tavli" && getVariant(variant).cube && (
        <p className="-mt-4 text-xs text-stone-400">{t.oneNoCube}</p>
      )}
      <TimeControlPicker value={clock} onChange={setClock} />
      <div className="flex flex-col gap-2">
        <label htmlFor="join-code" className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          {t.joinWithCode}
        </label>
        <div className="flex gap-2">
          <input
            id="join-code"
            aria-label={t.joinCode}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 font-mono uppercase tracking-widest text-stone-100 outline-none focus:border-amber-400"
            value={code}
            maxLength={6}
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button disabled={code.length < 6 || !ready} onClick={() => joinInvite(code)}>
            {t.join}
          </Button>
        </div>
      </div>
      {lastError && (
        <p role="alert" className="text-center text-sm text-red-400">
          {lastError === "banned" ? t.banned : errorText(t, lastError)}
        </p>
      )}
    </SetupLayout>
  );
}

type BoardKind = "rating" | "month" | "active";
const BOARD_KINDS: readonly BoardKind[] = ["rating", "month", "active"];

/** One row of a ranking: place, player (opens the profile) and the value on the right. */
interface BoardRow {
  readonly playerId: string;
  readonly name: string;
  readonly frame?: Frame | null;
  readonly rank?: number;
  readonly supporter?: boolean;
  readonly value: string;
  readonly detail?: string;
  readonly tone?: "up" | "down";
}

function LeaderboardPanel({ onReplay }: { onReplay: (records: GameRecord[]) => void }) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const [board, setBoard] = useState<BoardKind>("rating");
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [pool, setPool] = useState<RatingPool>("normal");
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [month, setMonth] = useState<MonthBoard | null>(null);
  const [active, setActive] = useState<ActiveBoard | null>(null);
  const [mine, setMine] = useState<RatingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ playerId: string; name: string } | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    const fail = (e: unknown) => setError(errorOf(t, e));
    if (board === "rating")
      fetchLeaderboard(variant, pool)
        .then((list) =>
          setRows(list.map((r) => ({ ...r, value: String(r.rating), detail: `${r.wins}/${r.matches}` }))),
        )
        .catch(fail);
    else if (board === "month")
      fetchMonthBoard(variant, pool)
        .then((b) => {
          setMonth(b);
          setRows(
            b.entries.map((r) => ({
              ...r,
              value: signed(r.gain),
              detail: t.boardMatches.replace("{n}", String(r.matches)),
              tone: r.gain >= 0 ? "up" : "down",
            })),
          );
        })
        .catch(fail);
    else
      fetchActiveBoard()
        .then((b) => {
          setActive(b);
          setRows(b.entries.map((r) => ({ ...r, value: String(r.matches) })));
        })
        .catch(fail);
  }, [board, variant, pool, t]);
  useEffect(() => {
    if (profile)
      fetchProfile(profile.id)
        .then((p) => setMine([...p.ratings]))
        .catch(() => {});
  }, [profile]);

  const monthName = (m: string) =>
    new Date(`${m}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "long", year: "numeric" });
  const previousMonth = (m: string) => {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, mo - 2, 15)).toISOString().slice(0, 7);
  };

  return (
    <div className="flex flex-col gap-4">
      {mine.length > 0 && board === "rating" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mine.map((r) => (
            <Card key={`${r.variant}${r.pool ?? ""}`} className="!p-3 text-center">
              <div className="text-2xl font-bold text-amber-100 tabular-nums">{r.rating}</div>
              <div className="text-xs text-stone-400">
                {variantName(r.variant, t.tavliMatch)}
                {r.pool === "blitz" && (
                  <>
                    {" "}
                    · <Icon name="blitz" /> {t.timeControls.blitz}
                  </>
                )}{" "}
                · {r.wins}/{r.matches}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <Segmented
          label={t.boardKind}
          value={board}
          onChange={setBoard}
          options={BOARD_KINDS.map((k) => ({ value: k, label: t.boardKinds[k] }))}
        />
        {board !== "active" && (
          <>
            <div className="mt-3">
              <Segmented
                label={t.leaderboard}
                value={variant}
                onChange={setVariant}
                options={MATCH_VARIANTS.map((v) => ({ value: v, label: variantName(v, t.tavliMatch) }))}
              />
            </div>
            <div className="mt-3">
              <Segmented
                label={t.ratingPool}
                value={pool}
                onChange={setPool}
                options={RATING_POOLS.map((p) => ({
                  value: p,
                  label:
                    p === "blitz" ? (
                      <>
                        <Icon name="blitz" /> {t.timeControls.blitz}
                      </>
                    ) : (
                      t.ratingPools.normal
                    ),
                }))}
              />
            </div>
          </>
        )}
        {board === "month" && month && (
          <p className="mt-3 text-xs text-stone-400" data-testid="board-note">
            {t.boardMonthNote
              .replace("{month}", monthName(month.month))
              .replace("{n}", String(month.minMatches))}
          </p>
        )}
        {board === "active" && active && (
          <p className="mt-3 text-xs text-stone-400" data-testid="board-note">
            {t.boardActiveNote
              .replace("{days}", String(active.days))
              .replace("{n}", String(active.perOpponentDay))}
          </p>
        )}
        {board === "month" && month && month.previous.length > 0 && (
          <section
            aria-label={t.boardPodium.replace("{month}", monthName(previousMonth(month.month)))}
            className="mt-3 rounded-lg border border-brass/30 bg-stone-900/60 px-3 py-2"
            data-testid="month-podium"
          >
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brass">
              {t.boardPodium.replace("{month}", monthName(previousMonth(month.month)))}
            </h3>
            <ol className="flex flex-col gap-1 text-sm">
              {month.previous.map((p, i) => (
                <li key={p.playerId} className="flex items-center gap-2">
                  <Plaque place={(i + 1) as 1 | 2 | 3} size={18} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:text-amber-200"
                    onClick={() => setSelected(p)}
                  >
                    <PlayerName name={p.name} frame={p.frame} rank={p.rank} supporter={p.supporter} />
                  </button>
                  <span className="tabular-nums text-stone-400">{signed(p.gain)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {rows && rows.length === 0 && <p className="mt-3 text-sm text-stone-500">{t.noRanking}</p>}
        {rows && rows.length > 0 && (
          <ol className="mt-3 divide-y divide-stone-800 text-sm" data-testid="ranking">
            {rows.map((r, i) => (
              <li key={r.playerId}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`flex w-full items-center gap-3 rounded py-2 text-left hover:bg-stone-800/60 ${r.playerId === profile?.id ? "text-amber-200" : "text-stone-200"}`}
                >
                  <span className="w-6 text-right text-stone-500 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <PlayerName name={r.name} frame={r.frame} rank={r.rank} supporter={r.supporter} />{" "}
                    {r.playerId === profile?.id && t.you2}
                  </span>
                  {r.detail && <span className="text-xs text-stone-500 tabular-nums">{r.detail}</span>}
                  <span
                    className={`w-12 text-right font-semibold tabular-nums ${
                      r.tone === "up" ? "text-emerald-300" : r.tone === "down" ? "text-red-300" : ""
                    }`}
                  >
                    {r.value}
                  </span>
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

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export type OnlineTab = "corr" | "friends" | "tournaments" | "clubs" | "live" | "ranking";

/** Everything with other people: new live and correspondence games, then the sections. */
export function OnlineScreen({
  onReplay,
  tournament,
  onWatch,
  onCorr,
  onSetup,
  initialTab,
  todo,
}: {
  /** Tab to start on (the tournament focus wins). */
  initialTab?: OnlineTab | null;
  onReplay: (records: GameRecord[]) => void;
  /** Open the tournaments tab with this tournament expanded. */
  tournament?: string | null;
  onWatch: (matchId: string) => void;
  /** Opens a correspondence game. */
  onCorr: (id: string) => void;
  /** Opens the setup of a new live or correspondence game. */
  onSetup: (mode: "online" | "corr") => void;
  /** Counters on the tabs. */
  todo?: Todo | null;
}) {
  const t = useT();
  const { profile, serverUrl } = useOnline();
  const lobby = useOnline((s) => s.lobby);
  const challenge = useOnline((s) => s.incoming !== null);
  const [tab, setTab] = useState<OnlineTab>(tournament ? "tournaments" : (initialTab ?? "corr"));

  // Connect and refresh account data once per profile (not on every profile field change).
  const profileId = profile?.id;
  useEffect(() => {
    if (profileId && serverUrl) {
      connect();
      syncAccount().catch(() => {});
    }
  }, [profileId, serverUrl]);

  const count = (n: number) => <CountBadge n={n} />;
  return (
    <Page>
      <ScreenTitle title={t.navOnline} subtitle={t.onlineIntro}>
        {profile && <StatusPill />}
      </ScreenTitle>
      {!serverUrl ? (
        <Card>
          <p className="text-stone-300">{t.noServer}</p>
        </Card>
      ) : !profile ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-300">{t.onlineNeedsProfile}</p>
            <AuthForm />
          </div>
          <ul className="flex flex-col gap-3">
            {(
              [
                [GLYPH.live, t.liveMatch, t.modeOnlineDetail],
                [GLYPH.mail, t.modeCorr, t.modeCorrDetail],
                [GLYPH.ranking, `${t.tournamentsTab} · ${t.clubsTab}`, t.onlineFeatureEvents],
                [GLYPH.people, t.friendsTab, t.onlineFeatureFriends],
              ] as const
            ).map(([d, title, detail]) => (
              <li key={title} className="flex items-center gap-4 rounded-xl border border-stone-800/70 p-4">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-800 text-amber-300"
                >
                  <Glyph d={d} />
                </span>
                <span>
                  <span className="block font-semibold text-stone-100">{title}</span>
                  <span className="block text-sm text-stone-400">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:gap-6">
            <section aria-labelledby="online-new" className="flex flex-col gap-3">
              <SectionTitle id="online-new">{t.newGameTitle}</SectionTitle>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
                <ActionCard
                  compact
                  icon={<Glyph d={GLYPH.live} />}
                  title={t.liveMatch}
                  detail={lobby.kind === "queued" ? t.searching : t.modeOnlineSub}
                  dot={lobby.kind !== "idle"}
                  onClick={() => onSetup("online")}
                />
                <ActionCard
                  compact
                  icon={<Glyph d={GLYPH.mail} />}
                  title={t.modeCorr}
                  detail={t.modeCorrSub}
                  onClick={() => onSetup("corr")}
                />
              </div>
            </section>
            <Tabs
              chips
              side
              label={t.navOnline}
              value={tab}
              onChange={setTab}
              options={[
                {
                  value: "corr",
                  label: (
                    <>
                      {t.corrTab}
                      {count((todo?.corrTurn.length ?? 0) + (todo?.corrInvites.length ?? 0))}
                    </>
                  ),
                },
                {
                  value: "friends",
                  label: (
                    <>
                      {t.friendsTab}
                      {count((todo?.friendRequests ?? 0) + (challenge ? 1 : 0))}
                    </>
                  ),
                },
                { value: "tournaments", label: t.tournamentsTab },
                { value: "clubs", label: t.clubsTab },
                { value: "live", label: t.liveTab },
                { value: "ranking", label: t.leaderboard },
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {tab === "friends" && <FriendsPanel onWatch={onWatch} />}
            {tab === "live" && <LivePanel onWatch={onWatch} />}
            {tab === "corr" && <CorrPanel onOpen={onCorr} />}
            {tab === "clubs" && <ClubsPanel onCorr={onCorr} />}
            {tab === "tournaments" && <TournamentPanel focus={tournament} onReplay={onReplay} />}
            {tab === "ranking" && <LeaderboardPanel onReplay={onReplay} />}
          </div>
        </div>
      )}
    </Page>
  );
}

/** Account, privacy and own matches (from the profile screen). */
export function AccountScreen({
  onBack,
  onReplay,
}: {
  onBack: () => void;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  return (
    <Page narrow>
      <ScreenTitle title={t.accountAndData} onBack={onBack} />
      {profile ? <ProfileTab onReplay={onReplay} /> : <AuthForm />}
    </Page>
  );
}
