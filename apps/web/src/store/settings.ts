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
      update: (patch) => set(patch),
    }),
    { name: "tavli.settings", version: 1 },
  ),
);
