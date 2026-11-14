import type { ProfileResponse } from "@tavli/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { Card } from "../components/ui";
import { variantShortName } from "../components/VariantPicker";
import { useT } from "../i18n";
import { fetchProfile, unqueue } from "../online/client";
import { useOnline } from "../online/store";
import { type Todo, todoCount } from "../online/todo";
import { today, usePuzzles } from "../puzzle";
import { useGame } from "../store/game";
import { type PlayMode, useSettings } from "../store/settings";
import { ListGroup, ListRow, Logo, ScreenTitle } from "./AppShell";
import { CorrSetup } from "./CorrScreens";
import { LegalFooter, LocalSetup, levelName, startBotGame, useOnlineStatus } from "./MenuScreens";
import { AuthForm } from "./OnlineProfile";
import { type OnlineTab, PlayPanel } from "./OnlineScreen";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const label = "text-xs font-semibold uppercase tracking-wide";

// ---- Start ---------------------------------------------------------------------------------------

export function HomeScreen({
  todo,
  onResume,
  onPlay,
  onStarted,
  onOnline,
  onCorr,
  onProfile,
  onPuzzle,
}: {
  todo: Todo | null;
  onResume: () => void;
  /** Opens the "Play" screen on a mode. */
  onPlay: (mode: PlayMode) => void;
  /** A one-tap game was started. */
  onStarted: () => void;
  onOnline: (tab?: OnlineTab) => void;
  onCorr: (id: string) => void;
  onProfile: () => void;
  onPuzzle: () => void;
}) {
  const t = useT();
  const match = useGame((s) => s.match);
  const mode = useGame((s) => s.mode);
  const players = useGame((s) => s.players);
  const onlineMatch = useOnline((s) => (s.match && s.match.end === null ? s.match : null));
  const profile = useOnline((s) => s.profile);
  const status = useOnline((s) => s.status);
  const lobby = useOnline((s) => s.lobby);
  const lastBot = useSettings((s) => s.lastBot);
  const playerName = useSettings((s) => s.playerName);
  const solvedToday = usePuzzles((s) => s.results[today()] !== undefined);
  const online = useOnlineStatus();
  const canResume = mode === "local" && match !== null && match.winner === null;
  const name = profile?.name ?? (playerName || t.you);

  const resume: { title: string; detail: string } | null = onlineMatch
    ? {
        title: `${variantShortName(onlineMatch.variant)} · ${onlineMatch.players[onlineMatch.seat === 0 ? 1 : 0].name}`,
        detail: t.resumeOnline,
      }
    : canResume
      ? {
          title: `${variantShortName(match.config.variant)} · ${players[0].kind === "bot" ? players[0].name : players[1].name}`,
          detail: `${t.scoreShort} ${match.score[0]} : ${match.score[1]}${match.config.length ? ` · ${match.config.length} ${t.points}` : ""}`,
        }
      : null;

  const total = todoCount(todo);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] md:min-h-dvh md:justify-center short:grid short:min-h-dvh short:max-w-none short:grid-cols-2 short:content-center short:items-start short:gap-4 short:py-3">
      <header className="flex items-center gap-3 short:hidden">
        <Logo className="h-11 w-11" />
        <h1 className="min-w-0 flex-1 text-xl font-bold tracking-tight text-amber-100">{t.appTitle}</h1>
        <button
          type="button"
          onClick={onProfile}
          aria-label={`${t.navProfile}: ${name}`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-stone-700 font-semibold text-stone-50 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {initials(name)}
          {profile && (
            <span
              className={`absolute right-0.5 bottom-0.5 h-3 w-3 rounded-full border-2 border-stone-950 ${status === "ready" ? "bg-emerald-400" : "bg-stone-500"}`}
            />
          )}
        </button>
      </header>

      <div className="flex flex-col gap-4">
        {resume && (
          <section
            aria-label={t.continueTitle}
            className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-stone-900 p-4"
          >
            <div>
              <p className={`${label} text-amber-300`}>{t.continueTitle}</p>
              <p className="mt-1 truncate text-lg font-semibold text-stone-50">{resume.title}</p>
              <p className="text-sm text-stone-400">{resume.detail}</p>
            </div>
            <button
              type="button"
              onClick={onResume}
              className="min-h-12 rounded-xl bg-amber-500 text-lg font-bold text-stone-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              {onlineMatch ? t.resumeOnline : t.resume}
            </button>
          </section>
        )}
        {lobby.kind === "queued" && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
            <button
              type="button"
              className="flex min-h-11 items-center gap-2"
              onClick={() => onPlay("online")}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse" />
              {t.searching}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg px-2 text-stone-300 hover:bg-stone-800"
              onClick={() => unqueue()}
            >
              ✕ {t.cancel}
            </button>
          </div>
        )}
        <section aria-labelledby="quick-h" className="flex flex-col gap-2">
          <h2 id="quick-h" className={`${label} px-1 text-stone-400`}>
            {t.quickStart}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Tile
              title={t.modeBot}
              detail={
                lastBot
                  ? t.quickBotSub
                      .replace("{variant}", variantShortName(lastBot.variant))
                      .replace("{level}", levelName(t, lastBot.level))
                  : t.modeBotSub
              }
              onClick={() => {
                if (!lastBot) return onPlay("bot");
                startBotGame(t, lastBot);
                onStarted();
              }}
            />
            <Tile title={t.modeOnline} detail={t.quickOnlineSub} onClick={() => onPlay("online")} />
            <Tile title={t.modeHuman} detail={t.modeHumanSub} onClick={() => onPlay("human")} />
            <Tile title={t.modeCorr} detail={t.modeCorrSub} onClick={() => onPlay("corr")} />
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        {todo && total > 0 && (
          <section
            aria-label={t.todoTitle}
            className="flex flex-col rounded-2xl border border-stone-800 bg-stone-900/80 p-2"
          >
            <h2 className={`${label} px-2 py-1 text-stone-400`}>
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
        <button
          type="button"
          onClick={onPuzzle}
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900/80 px-4 text-left hover:border-stone-600 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <span className="flex-1">
            <span className="block text-[15px] text-stone-100">{t.puzzle}</span>
            <span className="block text-xs text-stone-400">{solvedToday ? t.puzzleDone : t.puzzleOpen}</span>
          </span>
          {!solvedToday && <span className="text-sm font-semibold text-amber-300">{t.solve}</span>}
        </button>
        {!online && <p className="text-center text-xs text-stone-500">📴 {t.offlineHint}</p>}
      </div>
    </div>
  );
}

function Tile({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col justify-center gap-1 rounded-2xl border border-stone-800 bg-stone-900/80 p-3 text-left hover:border-stone-600 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span className="text-[15px] font-semibold text-stone-50">{title}</span>
      <span className="truncate text-xs text-stone-400">{detail}</span>
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

// ---- Spielen -------------------------------------------------------------------------------------

export function PlayScreen({ onStarted, onCorr }: { onStarted: () => void; onCorr: (id: string) => void }) {
  const t = useT();
  const mode = useSettings((s) => s.playMode);
  const update = useSettings((s) => s.update);
  const profile = useOnline((s) => s.profile);
  const modes: [PlayMode, string, string][] = [
    ["bot", t.modeBot, t.modeBotSub],
    ["human", t.modeHuman, t.modeHumanSub],
    ["online", t.modeOnline, t.modeOnlineSub],
    ["corr", t.modeCorr, t.modeCorrSub],
  ];
  const needsProfile = (mode === "online" || mode === "corr") && !profile;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <ScreenTitle title={t.navPlay} />
      <fieldset className="flex flex-col gap-2">
        <legend className={`${label} mb-2 text-stone-400`}>{t.modeQuestion}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modes.map(([id, title, sub]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => update({ playMode: id })}
              className={`flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                mode === id
                  ? "border-amber-400 bg-amber-400/10"
                  : "border-stone-800 bg-stone-900 hover:border-stone-600"
              }`}
            >
              <span className="text-[15px] font-semibold text-stone-50">{title}</span>
              <span className="text-xs text-stone-400">{sub}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {(mode === "bot" || mode === "human") && <LocalSetup opponent={mode} onStarted={onStarted} />}
      {needsProfile && (
        <>
          <p className="text-sm text-stone-300">{t.onlineNeedsProfile}</p>
          <AuthForm />
        </>
      )}
      {mode === "online" && profile && <PlayPanel />}
      {mode === "corr" && profile && <CorrSetup onOpen={onCorr} />}
    </div>
  );
}

// ---- Lernen --------------------------------------------------------------------------------------

export function LearnScreen({
  onTutorial,
  onPuzzle,
  onRules,
}: {
  onTutorial: () => void;
  onPuzzle: () => void;
  onRules: () => void;
}) {
  const t = useT();
  const solvedToday = usePuzzles((s) => s.results[today()] !== undefined);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6 short:min-h-dvh short:justify-center">
      <ScreenTitle title={t.learnTitle} />
      <div className="grid gap-3 sm:grid-cols-3 short:grid-cols-3">
        <LearnCard icon="🎓" title={t.tutorial} detail={t.tutorialSub} onClick={onTutorial} />
        <LearnCard
          icon="🧩"
          title={t.puzzle}
          detail={solvedToday ? t.puzzleDone : t.puzzleOpen}
          onClick={onPuzzle}
          dot={!solvedToday}
        />
        <LearnCard icon="📖" title={t.rules} detail={t.rulesSub} onClick={onRules} />
      </div>
    </div>
  );
}

function LearnCard({
  icon,
  title,
  detail,
  onClick,
  dot = false,
}: {
  icon: string;
  title: string;
  detail: string;
  onClick: () => void;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 items-center gap-4 rounded-2xl border border-stone-800 bg-stone-900/80 p-4 text-left hover:border-stone-600 focus-visible:outline-2 focus-visible:outline-amber-400 sm:flex-col sm:items-start"
    >
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-semibold text-stone-50">
          {title}
          {dot && <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />}
        </span>
        <span className="block text-sm text-stone-400">{detail}</span>
      </span>
    </button>
  );
}

// ---- Profil --------------------------------------------------------------------------------------

export function ProfileScreen({
  onStats,
  onSettings,
  onDesigns,
  onRanking,
  onAccount,
  onLegal,
}: {
  onStats: () => void;
  onSettings: () => void;
  onDesigns: () => void;
  onRanking: () => void;
  onAccount: () => void;
  onLegal: (page: "imprint" | "privacy") => void;
}) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
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
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-stone-700 text-xl font-bold text-stone-50">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-amber-100">{name}</h1>
          <p className="text-sm text-stone-400">
            {!profile
              ? t.profileLocal
              : profile.username
                ? `${t.profileAccount} · ${profile.username}`
                : t.profileGuest}
          </p>
        </div>
      </header>
      {ratings.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {ratings.map((r) => (
            <Card key={`${r.variant}${r.pool ?? ""}`} className="!p-3 text-center">
              <span className="block text-xl font-bold text-amber-100 tabular-nums">{r.rating}</span>
              <span className="block truncate text-xs text-stone-400">
                {variantShortName(r.variant)}
                {r.pool && r.pool !== "normal" ? ` · ${r.pool}` : ""}
              </span>
            </Card>
          ))}
        </div>
      )}
      <ListGroup>
        <ListRow
          icon={<Glyph d="M4 20V10M10 20V4M16 20v-7M22 20H2" />}
          label={t.statsAndAchievements}
          onClick={onStats}
        />
        <ListRow
          icon={<Glyph d="M4 18h4v-5H4zM10 18h4V7h-4zM16 18h4v-8h-4z" />}
          label={t.leaderboard}
          onClick={onRanking}
        />
        <ListRow
          icon={<Glyph d="M4 5h16v14H4zM12 5v14M4 12h4M16 12h4" />}
          label={t.boardAndDice}
          onClick={onDesigns}
        />
        <ListRow
          icon={
            <Glyph d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          }
          label={t.settings}
          onClick={onSettings}
        />
        <ListRow
          icon={<Glyph d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />}
          label={t.accountAndData}
          detail={t.accountSub}
          onClick={onAccount}
        />
      </ListGroup>
      <LegalFooter onLegal={onLegal} />
    </div>
  );
}

function Glyph({ d }: { d: string }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
