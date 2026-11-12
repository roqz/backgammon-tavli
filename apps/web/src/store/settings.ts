import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoardStyle } from "../board/themes";
import type { DiceSkin } from "../rewards";

export interface Settings {
  style: BoardStyle;
  lang: "de" | "en";
  showPips: boolean;
  showNumbers: boolean;
  autoRoll: boolean;
  autoConfirm: boolean;
  /** When doubling is possible: roll automatically after a cancellable countdown. */
  autoRollCountdown: boolean;
  /** Auto-confirm only after a cancellable countdown. */
  autoConfirmDelay: boolean;
  sound: boolean;
  /** Animated 3D dice throw (loads three.js on demand). */
  dice3d: boolean;
  /** Mirror the board horizontally: the own home board is drawn bottom left. */
  homeLeft: boolean;
  /** Show the opponent's quick messages in online games. */
  showEmotes: boolean;
  /** Dice look (rewards unlock more). */
  diceSkin: DiceSkin;
  /** Confetti after a won game (a reward). */
  fireworks: boolean;
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
}

const browserLang = (): "de" | "en" =>
  typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      style: "classic",
      lang: browserLang(),
      showPips: true,
      showNumbers: true,
      autoRoll: true,
      autoConfirm: true,
      autoRollCountdown: true,
      autoConfirmDelay: true,
      sound: true,
      // The dice throw is a lot of motion: off by default when the system asks for less.
      dice3d: !(
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ),
      homeLeft: false,
      showEmotes: true,
      diceSkin: "theme",
      fireworks: true,
      update: (patch) => set(patch),
    }),
    { name: "tavli.settings", version: 1 },
  ),
);
