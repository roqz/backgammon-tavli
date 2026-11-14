import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AchievementLayer } from "./components/AchievementLayer";
import { afterHistory, historySettling } from "./components/overlay";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { useT } from "./i18n";
import { connect, joinInvite, watchMatch } from "./online/client";
import { useOnline } from "./online/store";
import { todoCount, useTodo } from "./online/todo";
import { AdminScreen } from "./screens/AdminScreen";
import { AppShell, type NavTarget, ScreenTitle } from "./screens/AppShell";
import { CorrGameScreen } from "./screens/CorrScreens";
import { ChallengePrompt, FriendLinkPrompt } from "./screens/FriendsPanel";
import { GameScreen } from "./screens/GameScreen";
import { HomeScreen, LearnScreen, PlayScreen, ProfileScreen } from "./screens/HomeScreens";
import { LegalScreen } from "./screens/LegalScreen";
import { AccountScreen, OnlineScreen, type OnlineTab } from "./screens/OnlineScreen";
import { PuzzleScreen } from "./screens/PuzzleScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { RulesScreen } from "./screens/RulesPanel";
import { type SectionId, SettingsPanel } from "./screens/SettingsPanel";
import { StatsScreen } from "./screens/StatsScreen";
import { TutorialScreen } from "./screens/TutorialScreen";
import { WatchScreen } from "./screens/WatchScreen";
import type { GameRecord } from "./store/archive";
import { useSettings } from "./store/settings";

type Screen =
  | NavTarget
  | "account"
  | "game"
  | "settings"
  | "stats"
  | "replay"
  | "rules"
  | "admin"
  | "imprint"
  | "privacy"
  | "watch"
  | "tutorial"
  | "puzzle"
  | "corr";

const NAV_SCREENS: readonly NavTarget[] = ["menu", "play", "online", "learn", "profile"];
/** Screens shown inside the navigation shell, with the destination they belong to. */
const SUB_SCREENS: Partial<Record<Screen, NavTarget>> = {
  settings: "profile",
  stats: "profile",
  account: "profile",
  imprint: "profile",
  privacy: "profile",
  rules: "learn",
};

/** Invite links look like `…/?join=ABC234`. */
const takeJoinCode = (): string | null => {
  const url = new URL(location.href);
  const code = url.searchParams.get("join");
  if (!code) return null;
  url.searchParams.delete("join");
  history.replaceState(null, "", url);
  return code.toUpperCase();
};

/** Notification links look like `…/?tournament=<id>`. */
const takeTournament = (href: string): string | null => {
  const url = new URL(href);
  const id = url.searchParams.get("tournament");
  if (!id) return null;
  url.searchParams.delete("tournament");
  if (href === location.href) history.replaceState(null, "", url);
  return id;
};

export function App() {
  const onlineMatchId = useOnline((s) => s.match?.matchId ?? null);
  const lang = useSettings((s) => s.lang);
  const t = useT();
  /** Settings page to open (the profile's "board & dice" opens the looks directly). */
  const [settingsPage, setSettingsPage] = useState<SectionId | null>(null);
  // Screen readers and hyphenation follow the app language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // The moderation screen is only reachable through `?admin`.
  const [screen, setScreenState] = useState<Screen>(() =>
    new URL(location.href).searchParams.has("admin") ? "admin" : "menu",
  );
  /**
   * Every screen change is a browser history entry, so the device Back button goes to the
   * previous screen instead of leaving the app (dialogs add their own entries, see overlay.ts).
   */
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const setScreen = useCallback((next: Screen | ((s: Screen) => Screen), replace = false) => {
    const current = screenRef.current;
    const target = typeof next === "function" ? next(current) : next;
    if (target === current) return;
    afterHistory(() => {
      if (replace) history.replaceState({ tavli: target }, "");
      else history.pushState({ tavli: target }, "");
    });
    screenRef.current = target;
    setScreenState(target);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: registered once; only the initial screen is recorded
  useEffect(() => {
    history.replaceState({ ...(history.state as object | null), tavli: screen }, "");
    const onPop = (e: PopStateEvent) => {
      // an overlay removing its own entry, not a navigation
      if (historySettling()) return;
      const target = (e.state as { tavli?: Screen } | null)?.tavli ?? "menu";
      setScreenState(target === "replay" && !replayRef.current ? "menu" : target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  /** Tournament to show when opening the online screen from a tournament match. */
  const [onlineFocus, setOnlineFocus] = useState<string | null>(null);
  /** Tab to open the online screen on (from the start page's to-do list). */
  const [onlineTab, setOnlineTab] = useState<OnlineTab | null>(null);
  /** Correspondence game shown on the "corr" screen (also from `?corr=<id>` links). */
  const [corrId, setCorrId] = useState<string | null>(() => new URL(location.href).searchParams.get("corr"));
  const [replay, setReplay] = useState<{ records: readonly GameRecord[]; back: Screen } | null>(null);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const openReplay = (records: GameRecord | readonly GameRecord[], back: Screen) => {
    setReplay({ records: Array.isArray(records) ? records : [records as GameRecord], back });
    setScreen("replay");
  };

  // Opened from a notification: on load, or the service worker focuses this already open window
  // and passes the notification's link on.
  useEffect(() => {
    const open = (id: string | null) => {
      if (!id) return;
      setOnlineFocus(id);
      setScreen((s) => (s === "game" && useOnline.getState().match ? s : "online"));
    };
    open(takeTournament(location.href));
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type !== "open-url" || !data.url) return;
      open(takeTournament(data.url));
      const corr = new URL(data.url).searchParams.get("corr");
      // a running online match is not left for a correspondence move
      if (corr && !(screenRef.current === "game" && useOnline.getState().match)) {
        setCorrId(corr);
        setScreen("corr");
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [setScreen]);

  // Links from "your move" notifications open the correspondence game.
  useEffect(() => {
    const url = new URL(location.href);
    if (!url.searchParams.get("corr")) return;
    url.searchParams.delete("corr");
    history.replaceState(history.state, "", url);
    setScreen("corr");
  }, [setScreen]);

  // Friend links (`?friend=<id>`): the prompt appears once a profile exists.
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("friend");
    if (!id) return;
    url.searchParams.delete("friend");
    history.replaceState(history.state, "", url);
    useOnline.getState().set({ pendingFriend: id });
    if (!useOnline.getState().profile) setScreen("online");
  }, [setScreen]);

  // With a profile the app stays connected, so friends see you online and can challenge you.
  const profileId = useOnline((s) => s.profile?.id);
  const serverUrl = useOnline((s) => s.serverUrl);
  useEffect(() => {
    if (profileId && serverUrl) connect();
  }, [profileId, serverUrl]);

  // Opened through an invite link: go to the online screen and join once connected.
  useEffect(() => {
    const code = takeJoinCode();
    if (!code) return;
    setScreen("online");
    if (useOnline.getState().profile) joinInvite(code);
    else useOnline.getState().set({ pendingJoin: code });
  }, [setScreen]);

  // A new online match was found: show the board.
  useEffect(() => {
    if (onlineMatchId) setScreen("game");
  }, [onlineMatchId, setScreen]);

  const todo = useTodo();
  const challengeWaiting = useOnline((s) => s.incoming !== null);
  /** The last main destination, where correspondence games and sub-screens return to. */
  const lastNav = useRef<NavTarget>("menu");
  if (NAV_SCREENS.includes(screen as NavTarget)) lastNav.current = screen as NavTarget;
  const openCorr = (id: string) => {
    setCorrId(id);
    setScreen("corr");
  };
  const openOnline = (tab?: OnlineTab) => {
    setOnlineTab(tab ?? null);
    setOnlineFocus(null);
    setScreen("online");
  };
  const nav = (target: NavTarget) => (target === "online" ? openOnline() : setScreen(target));
  const navActive: NavTarget | null = NAV_SCREENS.includes(screen as NavTarget)
    ? (screen as NavTarget)
    : (SUB_SCREENS[screen] ?? null);
  const inShell = navActive !== null;

  const content = (
    <>
      {screen === "menu" && (
        <HomeScreen
          todo={todo}
          onResume={() => setScreen("game")}
          onPlay={(mode) => {
            useSettings.getState().update({ playMode: mode });
            setScreen("play");
          }}
          onStarted={() => setScreen("game")}
          onOnline={openOnline}
          onCorr={openCorr}
          onProfile={() => setScreen("profile")}
          onPuzzle={() => setScreen("puzzle")}
        />
      )}
      {screen === "play" && <PlayScreen onStarted={() => setScreen("game", true)} onCorr={openCorr} />}
      {screen === "learn" && (
        <LearnScreen
          onTutorial={() => setScreen("tutorial")}
          onPuzzle={() => setScreen("puzzle")}
          onRules={() => setScreen("rules")}
        />
      )}
      {screen === "profile" && (
        <ProfileScreen
          onStats={() => setScreen("stats")}
          onSettings={() => {
            setSettingsPage(null);
            setScreen("settings");
          }}
          onDesigns={() => {
            setSettingsPage("looks");
            setScreen("settings");
          }}
          onRanking={() => openOnline("ranking")}
          onAccount={() => setScreen("account")}
          onLegal={(page) => setScreen(page)}
        />
      )}
      {screen === "account" && (
        <AccountScreen onBack={() => setScreen("profile")} onReplay={(r) => openReplay(r, "account")} />
      )}
      {(screen === "imprint" || screen === "privacy") && (
        <LegalScreen page={screen} onBack={() => setScreen("profile")} />
      )}
      {screen === "rules" && <RulesScreen onBack={() => setScreen("learn")} />}
      {screen === "admin" && (
        <AdminScreen onBack={() => setScreen("menu")} onReplay={(r) => openReplay(r, "admin")} />
      )}
      {screen === "settings" && (
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
          <ScreenTitle title={t.settings} onBack={() => setScreen("profile")} />
          <SettingsPanel key={settingsPage ?? "index"} initial={settingsPage} />
        </div>
      )}
      {screen === "online" && (
        <OnlineScreen
          onReplay={(r) => openReplay(r, "online")}
          tournament={onlineFocus}
          initialTab={onlineTab}
          todo={todo}
          onCorr={openCorr}
          onWatch={(id) => {
            watchMatch(id);
            setScreen("watch");
          }}
        />
      )}
      {screen === "stats" && (
        <StatsScreen
          onBack={() => setScreen("profile")}
          onReplay={(r) => openReplay(r, "stats")}
          onPlay={() => setScreen("play")}
          onImport={(records) => openReplay(records, "stats")}
        />
      )}
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh bg-stone-950 bg-[radial-gradient(ellipse_at_top,#292017_0%,#0c0a09_70%)] text-stone-100">
        {inShell ? (
          <AppShell active={navActive} onNav={nav} onlineBadge={todoCount(todo) + (challengeWaiting ? 1 : 0)}>
            {content}
          </AppShell>
        ) : (
          content
        )}
        {screen === "game" && (
          <GameScreen
            onMenu={() => setScreen("menu")}
            onReplay={(r) => openReplay(r, "game")}
            onTournament={(id) => {
              setOnlineFocus(id);
              setOnlineTab(null);
              setScreen("online");
            }}
          />
        )}
        {screen === "replay" && replay && (
          <ReplayScreen records={replay.records} onBack={() => setScreen(replay.back)} />
        )}
        {screen === "watch" && <WatchScreen onBack={() => setScreen("online")} />}
        {screen === "tutorial" && (
          <TutorialScreen onBack={() => setScreen("learn")} onPlay={() => setScreen("play")} />
        )}
        {screen === "puzzle" && <PuzzleScreen onBack={() => setScreen(lastNav.current)} />}
        {screen === "corr" && corrId && (
          <CorrGameScreen key={corrId} id={corrId} onBack={() => setScreen(lastNav.current)} />
        )}
        <ChallengePrompt />
        <FriendLinkPrompt />
        <AchievementLayer />
        <UpdatePrompt />
      </main>
    </MotionConfig>
  );
}
