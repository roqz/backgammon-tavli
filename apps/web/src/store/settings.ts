import type { BotLevel } from "@tavli/ai";
import type { MatchVariant } from "@tavli/engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoardStyle } from "../board/themes";
import type { CheckerSet, DiceSkin } from "../rewards";

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
  /** Length of those countdowns in seconds. */
  countdownSeconds: 1 | 2 | 3;
  /** Name for local games (when there is no online profile). */
  playerName: string;
  /** Settings sections the player folded away. */
  collapsed: readonly string[];
  sound: boolean;
  /** Animated 3D dice throw (loads three.js on demand). */
  dice3d: boolean;
  /** Mirror the board horizontally: the own home board is drawn bottom left. */
  homeLeft: boolean;
  /**
   * Phones held upright: "landscape" turns the game screen by 90° (for phones whose screen
   * rotation is locked but are held sideways).
   */
  gameOrientation: "auto" | "landscape";
  /** Show the opponent's quick messages in online games. */
  showEmotes: boolean;
  /** Dice look (rewards unlock more). */
  diceSkin: DiceSkin;
  /** Checker set over the board style ("theme" = the style's own checkers). */
  checkerSet: CheckerSet;
  /** Confetti after a won game (a reward). */
  fireworks: boolean;
  /** The board tilted with perspective, light and shadows (board/depth.ts). */
  boardDepth: boolean;
  /** Dice sound: plain or rattling in a cup (a reward). */
  diceSound: "classic" | "cup";
  /** Last choice on the "Play" screen. */
  playMode: PlayMode;
  /** Last game against the computer, for the one-tap start on the home screen. */
  lastBot: { variant: MatchVariant; length: number; level: BotLevel } | null;
}

export type PlayMode = "bot" | "human" | "online" | "corr";

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
      countdownSeconds: 3,
      playerName: "",
      collapsed: [],
      sound: true,
      // The dice throw is a lot of motion: off by default when the system asks for less.
      dice3d: !(
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ),
      homeLeft: false,
      gameOrientation: "auto",
      showEmotes: true,
      diceSkin: "theme",
      checkerSet: "theme",
      fireworks: true,
      boardDepth: false,
      diceSound: "classic",
      playMode: "bot",
      lastBot: null,
      update: (patch) => set(patch),
    }),
    { name: "tavli.settings", version: 1 },
  ),
);
