import type { BotLevel } from "@tavli/ai";
import type { MatchVariant } from "@tavli/engine";
import type { Looks } from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type BoardStyle, THEMES } from "../board/themes";
import { CHECKER_SETS, type CheckerSet, DICE_SKINS, type DiceSkin } from "../rewards";

export const SOUND_SETS = ["classic", "wood", "stone", "bells"] as const;
export type SoundSet = (typeof SOUND_SETS)[number];
/** What the dice land on (the others come from the exchange). */
export const DICE_SURFACES = ["classic", "felt", "bone", "marble"] as const;
export type DiceSurface = (typeof DICE_SURFACES)[number];

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
  /** Dice sound: plain or rattling in a cup (a reward). */
  diceSound: "classic" | "cup";
  /** Checker, hit and game-end sounds (the others come from the exchange). */
  soundSet: SoundSet;
  /** How the dice sound when they land. */
  diceSurface: DiceSurface;
  /** Last choice on the "Play" screen. */
  playMode: PlayMode;
  /** Last game against the computer, for the one-tap start on the home screen. */
  lastBot: { variant: MatchVariant; length: number; level: BotLevel } | null;
  /** When the looks (LOOK_KEYS) were last chosen here: the newest choice of all devices wins. */
  looksAt?: string;
}

/** Settings that follow the profile to every device; the others belong to the device. */
export const LOOK_KEYS = ["style", "diceSkin", "checkerSet", "soundSet", "diceSurface", "lang"] as const;

/** The looks to keep with the profile (none before the player chose any on this device). */
export const looksOf = (s: Settings): Looks | undefined =>
  s.looksAt
    ? {
        at: s.looksAt,
        style: s.style,
        diceSkin: s.diceSkin,
        checkerSet: s.checkerSet,
        soundSet: s.soundSet,
        diceSurface: s.diceSurface,
        lang: s.lang,
      }
    : undefined;

export type PlayMode = "bot" | "human" | "online" | "corr";

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  /** Looks chosen later on another device; unknown values (an older app) are left out. */
  absorbLooks: (looks: Looks) => void;
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
      diceSound: "classic",
      soundSet: "classic",
      diceSurface: "classic",
      playMode: "bot",
      lastBot: null,
      update: (patch) =>
        set(LOOK_KEYS.some((k) => k in patch) ? { ...patch, looksAt: new Date().toISOString() } : patch),
      absorbLooks: (l) =>
        set((s) => {
          if (s.looksAt && s.looksAt >= l.at) return s;
          const patch: Partial<Settings> = { looksAt: l.at, lang: l.lang };
          if (l.style in THEMES) patch.style = l.style as BoardStyle;
          if (l.diceSkin === "theme" || l.diceSkin in DICE_SKINS) patch.diceSkin = l.diceSkin as DiceSkin;
          if (l.checkerSet === "theme" || (CHECKER_SETS as readonly string[]).includes(l.checkerSet))
            patch.checkerSet = l.checkerSet as CheckerSet;
          if ((SOUND_SETS as readonly string[]).includes(l.soundSet)) patch.soundSet = l.soundSet as SoundSet;
          if ((DICE_SURFACES as readonly string[]).includes(l.diceSurface))
            patch.diceSurface = l.diceSurface as DiceSurface;
          return patch;
        }),
    }),
    { name: "tavli.settings", version: 1 },
  ),
);
