import type { ProfileResponse } from "@tavli/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { tokens, useCareer, weekId } from "../career";
import { Icon } from "../components/Icon";
import { BoardPreview } from "../components/Setup";
import { variantShortName } from "../components/VariantPicker";
import { type Dict, useT } from "../i18n";
import { openSettings } from "../navigation";
import { fetchProfile, unqueue } from "../online/client";
import { useOnlinePlayers } from "../online/presence";
import { useOnline } from "../online/store";
import { type Todo, todoCount } from "../online/todo";
import { puzzleVariant, today, usePuzzles } from "../puzzle";
import { useGame } from "../store/game";
import { type PlayMode, useSettings } from "../store/settings";
import {
  ActionCard,
  CountBadge,
  GLYPH,
  Glyph,
  ListGroup,
  ListRow,
  Logo,
  Page,
  PointStrip,
  ScreenTitle,
  SectionTitle,
} from "./AppShell";
import { CorrSetup } from "./CorrScreens";
import { LegalFooter, LocalSetup, levelName, startBotGame, useOnlineStatus } from "./MenuScreens";
import { AuthForm } from "./OnlineProfile";
import { type OnlineTab, PlayPanel, StatusPill } from "./OnlineScreen";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

// ---- Start: the title screen ---------------------------------------------------------------------

export function HomeScreen({
  todo,
  onResume,
  onSetup,
  onStarted,
  onOnline,
  onCorr,
  onPuzzle,
  onShowcase,
}: {
  todo: Todo | null;
  onShowcase: () => void;
  onResume: () => void;
  /** Opens the setup of a new game. */
  onSetup: (mode: PlayMode) => void;
  /** A one-tap game was started. */
  onStarted: () => void;
  onOnline: (tab?: OnlineTab) => void;
  onCorr: (id: string) => void;
  onPuzzle: () => void;
}) {
  const t = useT();
  const match = useGame((s) => s.match);
  const mode = useGame((s) => s.mode);
  const players = useGame((s) => s.players);
  const onlineMatch = useOnline((s) => (s.match && s.match.end === null ? s.match : null));
  const lobby = useOnline((s) => s.lobby);
  const challenge = useOnline((s) => s.incoming !== null);
  const lastBot = useSettings((s) => s.lastBot);
  const puzzleToday = usePuzzleToday();
  const online = useOnlineStatus();
  const playersOnline = useOnlinePlayers();
  const canResume = mode === "local" && match !== null && match.winner === null;

  const resume: { title: string; detail: string } | null = onlineMatch
    ? {
        title: t.resumeOnline,
        detail: `${variantShortName(onlineMatch.variant)} · ${onlineMatch.players[onlineMatch.seat === 0 ? 1 : 0].name}`,
      }
    : canResume
      ? {
          title: t.resume,
          detail: `${variantShortName(match.config.variant)} · ${players[0].kind === "bot" ? players[0].name : players[1].name} · ${match.score[0]}:${match.score[1]}`,
        }
      : null;
  const total = todoCount(todo);

  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] min-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))] w-full max-w-6xl content-center gap-8 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8 short:min-h-dvh short:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] short:items-center short:gap-8 short:py-4 wide:min-h-[calc(100dvh-4rem)] wide:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] wide:gap-x-16 wide:gap-y-8 wide:px-8 wide:py-10">
      {/* hero */}
      <div className="flex flex-col items-center text-center wide:items-start wide:text-left">
        <Logo className="h-20 w-20 short:h-16 short:w-16 wide:h-24 wide:w-24" />
        <h1 className="mt-4 font-display text-[40px] font-semibold leading-none text-amber-100 short:text-3xl wide:mt-6 wide:text-6xl">
          {t.appTitle}
        </h1>
        <p className="mt-2 max-w-xs text-stone-400 wide:max-w-none wide:text-lg">{t.tagline}</p>
        <PointStrip className="mt-6 max-w-xs wide:max-w-sm" />
      </div>

      {/* main menu */}
      <nav
        aria-label={t.navHome}
        className="flex w-full min-w-0 flex-col gap-3 justify-self-center short:row-span-2 short:max-w-sm sm:max-w-md wide:max-w-none wide:justify-self-stretch"
      >
        {lobby.kind === "queued" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-1 text-sm text-amber-100">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2"
              onClick={() => onSetup("online")}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse" />
              {t.searching}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg px-2 text-stone-300 hover:bg-stone-800"
              onClick={() => unqueue()}
            >
              <Icon name="close" /> {t.cancel}
            </button>
          </div>
        )}
        {resume && (
          <MenuButton
            primary
            icon={<Glyph d={GLYPH.play} />}
            title={resume.title}
            detail={resume.detail}
            onClick={onResume}
          />
        )}
        <MenuButton
          primary={!resume}
          icon={<Glyph d={GLYPH.computer} />}
          title={t.playComputer}
          detail={
            lastBot
              ? t.quickBotSub
                  .replace("{variant}", variantShortName(lastBot.variant))
                  .replace("{level}", levelName(t, lastBot.level))
              : t.modeBotDetail
          }
          onClick={() => {
            if (!lastBot) return onSetup("bot");
            startBotGame(t, lastBot);
            onStarted();
          }}
        />
        <MenuButton
          icon={
            <Glyph d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
          }
          title={t.online}
          detail={
            playersOnline
              ? `${t.playersOnline.replace("{n}", String(playersOnline))} · ${t.homeOnlineSub}`
              : t.homeOnlineSub
          }
          badge={total + (challenge ? 1 : 0)}
          onClick={() => onOnline()}
        />
        <div className="grid grid-cols-2 gap-3">
          <SmallButton icon={<Glyph d={GLYPH.people} className="h-5 w-5" />} onClick={() => onSetup("human")}>
            {t.modeHuman}
          </SmallButton>
          <SmallButton
            icon={<Glyph d={GLYPH.puzzle} className="h-5 w-5" />}
            onClick={onPuzzle}
            label={`${t.puzzle}: ${PUZZLE_STATE_TEXT[puzzleToday](t)}`}
            status={<PuzzleStatus state={puzzleToday} />}
          >
            {t.puzzle}
          </SmallButton>
        </div>
        {todo && total > 0 && (
          <section
            aria-label={t.todoTitle}
            className="mt-1 flex flex-col rounded-xl border border-stone-800 bg-stone-900/70 p-2"
          >
            <h2 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {t.todoTitle} · {total}
            </h2>
            {todo.corrTurn.map((g) => (
              <TodoRow
                key={g.id}
                accent
                label={`${t.todoCorrTurn}: ${g.players[g.seat === 0 ? 1 : 0].name}`}
                detail={`${variantShortName(g.variant)} · ${t.modeCorr}`}
                onClick={() => onCorr(g.id)}
              />
            ))}
            {todo.corrInvites.length > 0 && (
              <TodoRow
                label={t.todoCorrInvite}
                detail={todo.corrInvites
                  .map((g) => g.players.find((p) => p.id === g.createdBy)?.name)
                  .join(", ")}
                count={todo.corrInvites.length}
                onClick={() => onOnline("corr")}
              />
            )}
            {todo.friendRequests > 0 && (
              <TodoRow
                label={t.todoFriendRequests}
                count={todo.friendRequests}
                onClick={() => onOnline("friends")}
              />
            )}
          </section>
        )}
        <WeekLine onClick={onShowcase} />
        {!online && (
          <p className="text-center text-xs text-stone-500">
            <Icon name="offline" /> {t.offlineHint}
          </p>
        )}
      </nav>

      {/* the board as the title picture (wide screens), always in the classic look of the app */}
      <div className="hidden wide:col-start-2 wide:row-span-2 wide:row-start-1 wide:block">
        <BoardPreview
          variant={resume && match ? match.config.variant : (lastBot?.variant ?? "backgammon")}
          className="rounded-xl"
          classic
        />
      </div>
    </div>
  );
}

/** This week's tasks in one line (opens the showcase). */
function WeekLine({ onClick }: { onClick: () => void }) {
  const t = useT();
  const done = useCareer((s) => s.weeks[weekId()]?.length ?? 0);
  const balance = useCareer((s) => tokens(s));
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-left text-sm text-stone-300 hover:bg-stone-900/70 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span aria-hidden className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rotate-45 ${i < done ? "bg-amber-500" : "border border-stone-600"}`}
          />
        ))}
      </span>
      <span className="flex-1">
        {t.weeklyTitle} · {done}/3
      </span>
      <span className="text-xs text-stone-400">{t.tokens.replace("{n}", String(balance))}</span>
      <span aria-hidden className="text-stone-500">
        ›
      </span>
    </button>
  );
}

function MenuButton({
  primary = false,
  icon,
  title,
  detail,
  onClick,
  badge = 0,
}: {
  primary?: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-xl px-5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
        primary
          ? "bg-felt-500 text-stone-50 hover:bg-felt-400"
          : "border border-stone-700/80 bg-stone-900/80 text-stone-50 hover:border-amber-400/50 hover:bg-stone-900"
      }`}
    >
      <span aria-hidden className={primary ? "text-stone-100" : "text-amber-300"}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-lg font-bold leading-tight">
          {title}
          <CountBadge n={badge} />
        </span>
        <span className={`block truncate text-sm ${primary ? "text-[#bcd4c5]" : "text-stone-400"}`}>
          {detail}
        </span>
      </span>
    </button>
  );
}

/** Today's daily puzzle: not tried yet, solved, or tried without the best move. */
type PuzzleToday = "open" | "solved" | "tried";

const usePuzzleToday = (): PuzzleToday =>
  usePuzzles((s) => {
    const r = s.results[today()];
    return r === undefined ? "open" : r.solved ? "solved" : "tried";
  });

const PUZZLE_STATE_TEXT: Record<PuzzleToday, (t: Dict) => string> = {
  open: (t) => t.puzzleOpen,
  solved: (t) => t.puzzleDone,
  tried: (t) => t.puzzleTried,
};

/** Small status mark: open (amber dot), tried (grey circle), solved (green circle with a tick). */
function PuzzleStatus({ state }: { state: PuzzleToday }) {
  const common = { "aria-hidden": true, "data-testid": "puzzle-status", "data-state": state } as const;
  if (state === "open") return <span {...common} className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />;
  if (state === "tried") return <span {...common} className="h-4 w-4 shrink-0 rounded-full bg-stone-600" />;
  return (
    <span
      {...common}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-felt-500 text-stone-50"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
      >
        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SmallButton({
  icon,
  onClick,
  status,
  label,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  /** Shown after the text (e.g. today's puzzle state). */
  status?: ReactNode;
  /** Accessible name when the status adds to the text. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-stone-800 px-3 text-[15px] text-stone-200 hover:border-stone-600 hover:bg-stone-900/70 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span aria-hidden className="text-amber-300">
        {icon}
      </span>
      {children}
      {status}
    </button>
  );
}

function TodoRow({
  label: text,
  detail,
  count,
  accent = false,
  onClick,
}: {
  label: string;
  detail?: string;
  count?: number;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-left hover:bg-stone-800/70 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${accent ? "bg-amber-400" : "bg-stone-500"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-stone-100">{text}</span>
        {detail && <span className="block truncate text-xs text-stone-400">{detail}</span>}
      </span>
      {count !== undefined && (
        <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-stone-950 tabular-nums">
          {count}
        </span>
      )}
      <span aria-hidden className="text-stone-500">
        ›
      </span>
    </button>
  );
}

// ---- Offline: games on this device, practice and rules -------------------------------------------

export function OfflineScreen({
  onSetup,
  onTutorial,
  onPuzzle,
  onRules,
}: {
  onSetup: (mode: "bot" | "human") => void;
  onTutorial: () => void;
  onPuzzle: () => void;
  onRules: () => void;
}) {
  const t = useT();
  const lastBot = useSettings((s) => s.lastBot);
  const puzzleToday = usePuzzleToday();
  return (
    <Page>
      <ScreenTitle title={t.navPlay} subtitle={t.offlineSub} />
      <section aria-labelledby="offline-new" className="flex flex-col gap-3">
        <SectionTitle id="offline-new">{t.newGameTitle}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={<Glyph d={GLYPH.computer} />}
            title={t.playComputer}
            detail={
              lastBot
                ? `${t.lastTime}: ${t.quickBotSub
                    .replace("{variant}", variantShortName(lastBot.variant))
                    .replace("{level}", levelName(t, lastBot.level))}`
                : t.modeBotDetail
            }
            onClick={() => onSetup("bot")}
          />
          <ActionCard
            icon={<Glyph d={GLYPH.people} />}
            title={t.modeHuman}
            detail={t.modeHumanDetail}
            onClick={() => onSetup("human")}
          />
        </div>
      </section>
      <section aria-labelledby="offline-learn" className="flex flex-col gap-3">
        <SectionTitle id="offline-learn">{t.practiceTitle}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            icon={<Glyph d={GLYPH.puzzle} />}
            title={t.puzzle}
            detail={`${PUZZLE_STATE_TEXT[puzzleToday](t)} · ${variantShortName(puzzleVariant(today()))}`}
            status={<PuzzleStatus state={puzzleToday} />}
            onClick={onPuzzle}
          />
          <ActionCard
            icon={<Glyph d={GLYPH.school} />}
            title={t.tutorial}
            detail={t.tutorialSub}
            onClick={onTutorial}
          />
          <ActionCard icon={<Glyph d={GLYPH.book} />} title={t.rules} detail={t.rulesSub} onClick={onRules} />
        </div>
      </section>
    </Page>
  );
}

// ---- Setting up a new game -----------------------------------------------------------------------

export function SetupScreen({
  mode,
  onBack,
  onStarted,
  onCorr,
}: {
  mode: PlayMode;
  onBack: () => void;
  onStarted: () => void;
  onCorr: (id: string) => void;
}) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const head: Record<PlayMode, [string, string]> = {
    bot: [t.playComputer, t.modeBotDetail],
    human: [t.modeHuman, t.modeHumanDetail],
    online: [t.liveMatch, t.modeOnlineDetail],
    corr: [t.modeCorr, t.modeCorrDetail],
  };
  const [title, subtitle] = head[mode];
  const needsProfile = (mode === "online" || mode === "corr") && !profile;
  return (
    <Page>
      <ScreenTitle title={title} subtitle={subtitle} onBack={onBack}>
        {(mode === "online" || mode === "corr") && profile && <StatusPill />}
      </ScreenTitle>
      {(mode === "bot" || mode === "human") && (
        <LocalSetup key={mode} opponent={mode} onStarted={onStarted} />
      )}
      {needsProfile && (
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-sm text-stone-300">{t.onlineNeedsProfile}</p>
          <AuthForm />
        </div>
      )}
      {mode === "online" && profile && <PlayPanel />}
      {mode === "corr" && profile && <CorrSetup onOpen={onCorr} />}
    </Page>
  );
}

// ---- Profil --------------------------------------------------------------------------------------

export function ProfileScreen({
  onStats,
  onShowcase,
  onSupport,
  onSettings,
  onDesigns,
  onRanking,
  onAccount,
  onLegal,
}: {
  onStats: () => void;
  onShowcase: () => void;
  onSupport: () => void;
  onSettings: () => void;
  onDesigns: () => void;
  onRanking: () => void;
  onAccount: () => void;
  onLegal: (page: "imprint" | "privacy") => void;
}) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const supportEnabled = useOnline((s) => s.supportEnabled);
  const supporter = useOnline((s) => s.supporter && s.profile !== null);
  const playerName = useSettings((s) => s.playerName);
  const [data, setData] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    if (!profile) return;
    fetchProfile(profile.id)
      .then(setData)
      .catch(() => {});
  }, [profile]);
  const name = profile?.name ?? (playerName || t.you);
  const ratings = [...(data?.ratings ?? [])].sort((a, b) => b.matches - a.matches).slice(0, 3);
  return (
    <Page>
      <ScreenTitle title={t.navProfile} />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <section
          aria-label={name}
          className="flex flex-col gap-4 rounded-xl border border-stone-800 bg-stone-900/80 p-5"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-stone-700 text-xl font-bold text-stone-50">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-2xl font-semibold text-stone-50">{name}</h2>
              <p className="text-sm text-stone-400">
                {!profile
                  ? t.profileLocal
                  : profile.username
                    ? `${t.profileAccount} · ${profile.username}`
                    : t.profileGuest}
              </p>
            </div>
          </div>
          {ratings.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {ratings.map((r) => (
                <div
                  key={`${r.variant}${r.pool ?? ""}`}
                  className="rounded-xl bg-stone-800/70 p-2 text-center"
                >
                  <span className="block text-xl font-bold text-amber-100 tabular-nums">{r.rating}</span>
                  <span className="block truncate text-xs text-stone-400">
                    {variantShortName(r.variant)}
                    {r.pool && r.pool !== "normal" ? ` · ${r.pool}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="flex flex-col gap-6">
          <ListGroup>
            <ListRow
              icon={<Glyph d={GLYPH.trophy} className="h-5 w-5" />}
              label={t.showcase}
              detail={t.showcaseSub}
              onClick={onShowcase}
            />
            <ListRow
              icon={<Glyph d={GLYPH.stats} className="h-5 w-5" />}
              label={t.statsAndAchievements}
              onClick={onStats}
            />
            <ListRow
              icon={<Glyph d={GLYPH.ranking} className="h-5 w-5" />}
              label={t.leaderboard}
              onClick={onRanking}
            />
          </ListGroup>
          <ListGroup>
            <ListRow
              icon={<Glyph d={GLYPH.board} className="h-5 w-5" />}
              label={t.boardAndDice}
              onClick={onDesigns}
            />
            <ListRow
              icon={<Glyph d={GLYPH.bell} className="h-5 w-5" />}
              label={t.pushTitle}
              onClick={() => openSettings("notify")}
            />
            <ListRow
              icon={<Glyph d={GLYPH.settings} className="h-5 w-5" />}
              label={t.settings}
              onClick={onSettings}
            />
            <ListRow
              icon={<Glyph d={GLYPH.shield} className="h-5 w-5" />}
              label={t.accountAndData}
              detail={t.accountSub}
              onClick={onAccount}
            />
          </ListGroup>
          {supportEnabled && (
            <ListGroup>
              <ListRow
                icon={<Glyph d={GLYPH.heart} className="h-5 w-5 text-brass" />}
                label={t.supportTitle}
                detail={
                  supporter ? (
                    <>
                      <Icon name="heart" className="h-[1.15em] w-[1.15em] text-brass" /> {t.supporterBadge}
                    </>
                  ) : (
                    t.supportSub
                  )
                }
                onClick={onSupport}
              />
            </ListGroup>
          )}
          <LegalFooter onLegal={onLegal} />
        </div>
      </div>
    </Page>
  );
}
