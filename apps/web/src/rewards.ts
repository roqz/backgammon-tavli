import { useAchievements } from "./achievements";
import { type BoardStyle, type BoardTheme, THEMES } from "./board/themes";
import { useSettings } from "./store/settings";

/** Dice looks on top of the board style; "theme" uses the style's own dice. */
export type DiceSkin = "theme" | "gold" | "ruby";

export const DICE_SKINS: Record<Exclude<DiceSkin, "theme">, BoardTheme["die"]> = {
  gold: { fill: "#e7c15a", pip: "#3b2a07", edge: "#a07a1f" },
  ruby: { fill: "#9f1239", pip: "#fff1f2", edge: "#5f0a22" },
};

/**
 * What achievements unlock. Classic, Modern and High contrast are always available (the
 * contrast board is an accessibility feature, not a reward).
 */
export const REWARDS = {
  style: { night: "puzzle", marble: "all-variants", tournament: "online-win" } as Partial<
    Record<BoardStyle, string>
  >,
  dice: { gold: "beat-hard", ruby: "fifty-wins" } as Partial<Record<DiceSkin, string>>,
  /** Confetti after a won game. */
  fireworks: "first-win",
} as const;

export const isUnlocked = (achievement: string | undefined, unlocked: Record<string, string>): boolean =>
  !achievement || !!unlocked[achievement];

/** Board theme from the settings, falling back to free looks when a reward is not (or no longer) unlocked. */
export function useBoardTheme(): BoardTheme {
  const style = useSettings((s) => s.style);
  const dice = useSettings((s) => s.diceSkin);
  const unlocked = useAchievements((s) => s.unlocked);
  const base = THEMES[isUnlocked(REWARDS.style[style], unlocked) ? style : "classic"];
  if (dice === "theme" || !isUnlocked(REWARDS.dice[dice], unlocked)) return base;
  return { ...base, die: DICE_SKINS[dice] };
}

export function useFireworks(): boolean {
  const on = useSettings((s) => s.fireworks);
  const unlocked = useAchievements((s) => s.unlocked);
  return on && isUnlocked(REWARDS.fireworks, unlocked);
}
