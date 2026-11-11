import { MotionConfig } from "motion/react";
import { useState } from "react";
import { GameScreen } from "./screens/GameScreen";
import { Menu, NewGame, SettingsScreen } from "./screens/MenuScreens";
import { useGame } from "./store/game";

type Screen = "menu" | "new" | "game" | "settings";

export function App() {
  const hasGame = useGame((s) => s.match !== null && s.match.winner === null);
  const [screen, setScreen] = useState<Screen>("menu");

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh bg-stone-950 bg-[radial-gradient(ellipse_at_top,#292017_0%,#0c0a09_70%)] text-stone-100">
        {screen === "menu" && (
          <Menu
            onNew={() => setScreen("new")}
            onResume={() => setScreen("game")}
            onSettings={() => setScreen("settings")}
          />
        )}
        {screen === "new" && <NewGame onBack={() => setScreen("menu")} onStarted={() => setScreen("game")} />}
        {screen === "settings" && <SettingsScreen onBack={() => setScreen(hasGame ? "game" : "menu")} />}
        {screen === "game" && <GameScreen onMenu={() => setScreen("menu")} />}
      </main>
    </MotionConfig>
  );
}
