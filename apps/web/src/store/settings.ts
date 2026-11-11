import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoardStyle } from "../board/themes";

export interface Settings {
  style: BoardStyle;
  lang: "de" | "en";
  showPips: boolean;
  showNumbers: boolean;
  autoRoll: boolean;
  autoConfirm: boolean;
  sound: boolean;
  /** Animated 3D dice throw (loads three.js on demand). */
  dice3d: boolean;
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
      autoConfirm: false,
      sound: true,
      dice3d: true,
      update: (patch) => set(patch),
    }),
    { name: "tavli.settings", version: 1 },
  ),
);
