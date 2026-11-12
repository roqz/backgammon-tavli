import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AchievementLayer } from "./components/AchievementLayer";
import { afterHistory, historySettling } from "./components/overlay";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { connect, joinInvite, watchMatch } from "./online/client";
import { useOnline } from "./online/store";
import { AdminScreen } from "./screens/AdminScreen";
import { CorrGameScreen } from "./screens/CorrScreens";
import { ChallengePrompt, FriendLinkPrompt } from "./screens/FriendsPanel";
import { GameScreen } from "./screens/GameScreen";
import { LegalScreen } from "./screens/LegalScreen";
import { Menu, NewGame, SettingsScreen } from "./screens/MenuScreens";
import { OnlineScreen } from "./screens/OnlineScreen";
import { PuzzleScreen } from "./screens/PuzzleScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { RulesScreen } from "./screens/RulesPanel";
import { StatsScreen } from "./screens/StatsScreen";
import { TutorialScreen } from "./screens/TutorialScreen";
import { WatchScreen } from "./screens/WatchScreen";
import type { GameRecord } from "./store/archive";
import { useSettings } from "./store/settings";

type Screen =
  | "menu"
  | "new"
  | "game"
  | "settings"
  | "stats"
  | "replay"
  | "online"
  | "rules"
  | "admin"
  | "imprint"
  | "privacy"
  | "watch"
  | "tutorial"
  | "puzzle"
  | "corr";

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
  /** Correspondence game shown on the "corr" screen (also from `?corr=<id>` links). */
  const [corrId, setCorrId] = useState<string | null>(() => new URL(location.href).searchParams.get("corr"));
  const [replay, setReplay] = useState<{ records: readonly GameRecord[]; back: Screen } | null>(null);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const openReplay = (records: GameRecord | readonly GameRecord[], back: Screen) => {
    setReplay({ records: Array.isArray(records) ? records : [records as GameRecord], back });
    setScreen("replay");
  };

  // Opened from a tournament notification (on load, or the service worker focuses this window).
  useEffect(() => {
    const open = (id: string | null) => {
      if (!id) return;
      setOnlineFocus(id);
      setScreen((s) => (s === "game" && useOnline.getState().match ? s : "online"));
    };
    open(takeTournament(location.href));
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "open-url" && data.url) open(takeTournament(data.url));
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

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh bg-stone-950 bg-[radial-gradient(ellipse_at_top,#292017_0%,#0c0a09_70%)] text-stone-100">
        {screen === "menu" && (
          <Menu
            onNew={() => setScreen("new")}
            onResume={() => setScreen("game")}
            onSettings={() => setScreen("settings")}
            onStats={() => setScreen("stats")}
            onOnline={() => setScreen(onlineMatchId ? "game" : "online")}
            onRules={() => setScreen("rules")}
            onLegal={(page) => setScreen(page)}
            onTutorial={() => setScreen("tutorial")}
            onPuzzle={() => setScreen("puzzle")}
          />
        )}
        {(screen === "imprint" || screen === "privacy") && (
          <LegalScreen page={screen} onBack={() => setScreen("menu")} />
        )}
        {screen === "new" && (
          <NewGame onBack={() => setScreen("menu")} onStarted={() => setScreen("game", true)} />
        )}
        {screen === "rules" && <RulesScreen onBack={() => setScreen("menu")} />}
        {screen === "admin" && (
          <AdminScreen onBack={() => setScreen("menu")} onReplay={(r) => openReplay(r, "admin")} />
        )}
        {screen === "settings" && <SettingsScreen onBack={() => setScreen("menu")} />}
        {screen === "online" && (
          <OnlineScreen
            onBack={() => setScreen("menu")}
            onReplay={(r) => openReplay(r, "online")}
            tournament={onlineFocus}
            onCorr={(id) => {
              setCorrId(id);
              setScreen("corr");
            }}
            onWatch={(id) => {
              watchMatch(id);
              setScreen("watch");
            }}
          />
        )}
        {screen === "game" && (
          <GameScreen
            onMenu={() => setScreen("menu")}
            onReplay={(r) => openReplay(r, "game")}
            onTournament={(id) => {
              setOnlineFocus(id);
              setScreen("online");
            }}
          />
        )}
        {screen === "stats" && (
          <StatsScreen
            onBack={() => setScreen("menu")}
            onReplay={(r) => openReplay(r, "stats")}
            onPlay={() => setScreen("new")}
            onImport={(records) => openReplay(records, "stats")}
          />
        )}
        {screen === "replay" && replay && (
          <ReplayScreen records={replay.records} onBack={() => setScreen(replay.back)} />
        )}
        {screen === "watch" && <WatchScreen onBack={() => setScreen("online")} />}
        {screen === "tutorial" && (
          <TutorialScreen onBack={() => setScreen("menu")} onPlay={() => setScreen("new")} />
        )}
        {screen === "puzzle" && <PuzzleScreen onBack={() => setScreen("menu")} />}
        {screen === "corr" && corrId && <CorrGameScreen id={corrId} onBack={() => setScreen("online")} />}
        <ChallengePrompt />
        <FriendLinkPrompt />
        <AchievementLayer />
        <UpdatePrompt />
      </main>
    </MotionConfig>
  );
}
