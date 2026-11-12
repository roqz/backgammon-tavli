import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { joinInvite } from "./online/client";
import { useOnline } from "./online/store";
import { AdminScreen } from "./screens/AdminScreen";
import { GameScreen } from "./screens/GameScreen";
import { Menu, NewGame, SettingsScreen } from "./screens/MenuScreens";
import { OnlineScreen } from "./screens/OnlineScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { RulesScreen } from "./screens/RulesPanel";
import { StatsScreen } from "./screens/StatsScreen";
import type { GameRecord } from "./store/archive";

type Screen = "menu" | "new" | "game" | "settings" | "stats" | "replay" | "online" | "rules" | "admin";

/** Invite links look like `…/?join=ABC234`. */
const takeJoinCode = (): string | null => {
  const url = new URL(location.href);
  const code = url.searchParams.get("join");
  if (!code) return null;
  url.searchParams.delete("join");
  history.replaceState(null, "", url);
  return code.toUpperCase();
};

export function App() {
  const onlineMatchId = useOnline((s) => s.match?.matchId ?? null);
  // The moderation screen is only reachable through `?admin`.
  const [screen, setScreen] = useState<Screen>(() =>
    new URL(location.href).searchParams.has("admin") ? "admin" : "menu",
  );
  /** Tournament to show when opening the online screen from a tournament match. */
  const [onlineFocus, setOnlineFocus] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ records: readonly GameRecord[]; back: Screen } | null>(null);
  const openReplay = (records: GameRecord | readonly GameRecord[], back: Screen) => {
    setReplay({ records: Array.isArray(records) ? records : [records as GameRecord], back });
    setScreen("replay");
  };

  // Opened through an invite link: go to the online screen and join once connected.
  useEffect(() => {
    const code = takeJoinCode();
    if (!code) return;
    setScreen("online");
    if (useOnline.getState().profile) joinInvite(code);
    else useOnline.getState().set({ pendingJoin: code });
  }, []);

  // A new online match was found: show the board.
  useEffect(() => {
    if (onlineMatchId) setScreen("game");
  }, [onlineMatchId]);

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
          />
        )}
        {screen === "new" && <NewGame onBack={() => setScreen("menu")} onStarted={() => setScreen("game")} />}
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
          <StatsScreen onBack={() => setScreen("menu")} onReplay={(r) => openReplay(r, "stats")} />
        )}
        {screen === "replay" && replay && (
          <ReplayScreen records={replay.records} onBack={() => setScreen(replay.back)} />
        )}
      </main>
    </MotionConfig>
  );
}
