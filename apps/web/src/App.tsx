import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { joinInvite } from "./online/client";
import { useOnline } from "./online/store";
import { GameScreen } from "./screens/GameScreen";
import { Menu, NewGame, SettingsScreen } from "./screens/MenuScreens";
import { OnlineScreen } from "./screens/OnlineScreen";
import { ReplayScreen } from "./screens/ReplayScreen";
import { StatsScreen } from "./screens/StatsScreen";
import type { GameRecord } from "./store/archive";
import { useGame } from "./store/game";

type Screen = "menu" | "new" | "game" | "settings" | "stats" | "replay" | "online";

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
  const hasGame = useGame((s) => s.match !== null && s.match.winner === null);
  const onlineMatchId = useOnline((s) => s.match?.matchId ?? null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [replay, setReplay] = useState<{ record: GameRecord; back: Screen } | null>(null);
  const openReplay = (record: GameRecord, back: Screen) => {
    setReplay({ record, back });
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
          />
        )}
        {screen === "new" && <NewGame onBack={() => setScreen("menu")} onStarted={() => setScreen("game")} />}
        {screen === "settings" && <SettingsScreen onBack={() => setScreen(hasGame ? "game" : "menu")} />}
        {screen === "online" && <OnlineScreen onBack={() => setScreen("menu")} />}
        {screen === "game" && (
          <GameScreen onMenu={() => setScreen("menu")} onReplay={(r) => openReplay(r, "game")} />
        )}
        {screen === "stats" && (
          <StatsScreen onBack={() => setScreen("menu")} onReplay={(r) => openReplay(r, "stats")} />
        )}
        {screen === "replay" && replay && (
          <ReplayScreen record={replay.record} onBack={() => setScreen(replay.back)} />
        )}
      </main>
    </MotionConfig>
  );
}
