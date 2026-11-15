import type { Frame } from "@tavli/protocol";
import type { ReactNode } from "react";
import { useAchievements } from "./achievements";
import { type BoardStyle, type BoardTheme, THEMES } from "./board/themes";
import { hasSeason, type SeasonKey, useCareer } from "./career";
import { useSettings } from "./store/settings";

/** Dice looks on top of the board style; "theme" uses the style's own dice. */
export type DiceSkin = "theme" | "gold" | "ruby" | "brass" | "jade" | "obsidian" | "silver";

export const DICE_SKINS: Record<Exclude<DiceSkin, "theme">, BoardTheme["die"]> = {
  gold: { fill: "#e7c15a", pip: "#3b2a07", edge: "#a07a1f" },
  ruby: { fill: "#9f1239", pip: "#fff1f2", edge: "#5f0a22" },
  brass: { fill: "#c9a14a", pip: "#2a1d08", edge: "#8a6a25" },
  // rarities
  jade: { fill: "#5f9a7c", pip: "#f4efe0", edge: "#2f5a45" },
  obsidian: { fill: "#2a2530", pip: "#f0d68a", edge: "#c9a14a" },
  silver: { fill: "#d9dde2", pip: "#1d2630", edge: "#8d96a0" },
};

/** Checker sets on top of the board style (both colours, so they stay apart). */
export type CheckerSet = "theme" | "pearl" | "wood" | "onyx" | "brass" | "bone" | "lapis" | "amber";
export const CHECKER_SETS: readonly Exclude<CheckerSet, "theme">[] = [
  "pearl",
  "wood",
  "onyx",
  "brass",
  "bone",
  "lapis",
  "amber",
];

const disc = (id: string, inner: string, mid: string, outer: string) => (
  <radialGradient id={id} cx="0.38" cy="0.32" r="0.75">
    <stop offset="0" stopColor={inner} />
    <stop offset="0.7" stopColor={mid} />
    <stop offset="1" stopColor={outer} />
  </radialGradient>
);

/** Light and dark checker of each set, with the gradients they need. */
export const CHECKER_LOOKS: Record<
  Exclude<CheckerSet, "theme">,
  {
    readonly defs: ReactNode;
    readonly checkers: BoardTheme["checkers"];
    readonly swatch: readonly [string, string];
  }
> = {
  pearl: {
    defs: (
      <>
        {disc("cs-pearl-l", "#ffffff", "#ecebf3", "#cfd3e3")}
        {disc("cs-pearl-d", "#4b5d74", "#22303f", "#121a24")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-pearl-l)", edge: "#a9adc0", ring: "#e3e1ee" },
      { fill: "url(#cs-pearl-d)", edge: "#0b1118", ring: "#6a7f99" },
    ],
    swatch: ["#ecebf3", "#22303f"],
  },
  wood: {
    defs: (
      <>
        {disc("cs-wood-l", "#e6c896", "#c8a36a", "#9c7a45")}
        {disc("cs-wood-d", "#7a4a2c", "#4a2c18", "#2c190c")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-wood-l)", edge: "#86663a", ring: "#dcc08e" },
      { fill: "url(#cs-wood-d)", edge: "#1c0f06", ring: "#8a5a38" },
    ],
    swatch: ["#c8a36a", "#4a2c18"],
  },
  onyx: {
    defs: (
      <>
        {disc("cs-onyx-l", "#ffffff", "#f2efe8", "#d6d0c2")}
        {disc("cs-onyx-d", "#3a3a3a", "#151515", "#050505")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-onyx-l)", edge: "#b8b09d", ring: "#e6e1d6" },
      { fill: "url(#cs-onyx-d)", edge: "#000000", ring: "#4a4a4a" },
    ],
    swatch: ["#f2efe8", "#151515"],
  },
  brass: {
    defs: (
      <>
        {disc("cs-brass-l", "#f3dc93", "#c9a14a", "#8a6a25")}
        {disc("cs-brass-d", "#6b5434", "#4b3a22", "#2a1f10")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-brass-l)", edge: "#7a5c1c", ring: "#e3c574" },
      { fill: "url(#cs-brass-d)", edge: "#1a1208", ring: "#8a7048" },
    ],
    swatch: ["#c9a14a", "#4b3a22"],
  },
  bone: {
    defs: (
      <>
        {disc("cs-bone-l", "#fbf5e6", "#e9dfc8", "#c9b995")}
        {disc("cs-bone-d", "#3a2c24", "#1d1612", "#0b0806")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-bone-l)", edge: "#a8977a", ring: "#dfd2b5" },
      { fill: "url(#cs-bone-d)", edge: "#000000", ring: "#55443a" },
    ],
    swatch: ["#e9dfc8", "#1d1612"],
  },
  /** Rarity (500 wins): gold against lapis lazuli. */
  lapis: {
    defs: (
      <>
        {disc("cs-lapis-l", "#fff1b8", "#e2bd55", "#a8822a")}
        {disc("cs-lapis-d", "#4f6fc4", "#24408f", "#132458")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-lapis-l)", edge: "#4a3608", ring: "#fff1b8" },
      { fill: "url(#cs-lapis-d)", edge: "#0b1638", ring: "#d4b04a" },
    ],
    swatch: ["#e2bd55", "#24408f"],
  },
  /** Rarity (exchange only): amber and mocha. */
  amber: {
    defs: (
      <>
        {disc("cs-amber-l", "#ffd98a", "#e09a2e", "#a5600f")}
        {disc("cs-amber-d", "#6a4632", "#3e2618", "#1f120a")}
      </>
    ),
    checkers: [
      { fill: "url(#cs-amber-l)", edge: "#7a4508", ring: "#f5c46a" },
      { fill: "url(#cs-amber-d)", edge: "#120a05", ring: "#9a6a4a" },
    ],
    swatch: ["#e09a2e", "#3e2618"],
  },
};

/** Marks looks that only the exchange gives (luxury items, see SHOP in career.ts). */
export const SHOP_ONLY = "shop";

/**
 * What achievements unlock. Classic, Modern and High contrast are always available (the
 * contrast board is an accessibility feature, not a reward). Most looks can also be taken in
 * exchange for tokens (`SHOP` in career.ts, the item id is then in `owned`).
 */
export const REWARDS = {
  style: {
    night: "puzzle",
    marble: "all-variants",
    tournament: "online-win",
    olive: "ten-wins",
    inlay: "master-all",
    // any season of the kind (season-<kind>-<year>), see hasLook
    spring: "season-spring",
    summer: "season-summer",
    autumn: "season-autumn",
    winter: "season-winter",
    ebony: "perfect-12",
    salon: SHOP_ONLY,
  } as Partial<Record<BoardStyle, string>>,
  dice: {
    gold: "beat-hard",
    ruby: "fifty-wins",
    brass: "league-player",
    jade: "puzzles-100",
    obsidian: "expert-25",
    silver: SHOP_ONLY,
  } as Partial<Record<DiceSkin, string>>,
  checkers: {
    pearl: "set-pearl",
    wood: "set-wood",
    onyx: "set-onyx",
    brass: "set-brass",
    bone: "set-bone",
    lapis: "wins-500",
    amber: SHOP_ONLY,
  } as Partial<Record<CheckerSet, string>>,
  /** Confetti after a won game. */
  fireworks: "first-win",
  /** Dice rattling in a cup before they land. */
  diceCup: "gammon",
} as const;

export const isUnlocked = (achievement: string | undefined, unlocked: Record<string, string>): boolean =>
  !achievement || !!unlocked[achievement];

/** Shop ids per look kind. */
const SHOP_ID = { style: "style-", dice: "dice-", checkers: "set-" } as const;

/** Whether a look is available: free, unlocked by its achievement, or taken for tokens. */
export const hasLook = (
  kind: "style" | "dice" | "checkers",
  look: string,
  unlocked: Record<string, string>,
  owned: readonly string[],
): boolean => {
  const achievement = (REWARDS[kind] as Record<string, string | undefined>)[look];
  if (!achievement) return true;
  const season = /^season-(spring|summer|autumn|winter)$/.exec(achievement);
  if (season) return hasSeason(unlocked, season[1] as SeasonKey);
  if (achievement === SHOP_ONLY) return owned.includes(`${SHOP_ID[kind]}${look}`);
  return !!unlocked[achievement] || owned.includes(`${SHOP_ID[kind]}${look}`);
};

/** Board theme from the settings, falling back to free looks when a reward is not (or no longer) unlocked. */
export function useBoardTheme(): BoardTheme {
  const style = useSettings((s) => s.style);
  const dice = useSettings((s) => s.diceSkin);
  const set = useSettings((s) => s.checkerSet);
  const unlocked = useAchievements((s) => s.unlocked);
  const owned = useCareer((s) => s.owned);
  let theme = THEMES[hasLook("style", style, unlocked, owned) ? style : "classic"];
  if (dice !== "theme" && hasLook("dice", dice, unlocked, owned)) theme = { ...theme, die: DICE_SKINS[dice] };
  if (set && set !== "theme" && hasLook("checkers", set, unlocked, owned)) {
    const look = CHECKER_LOOKS[set];
    theme = {
      ...theme,
      defs: (
        <>
          {theme.defs}
          {look.defs}
        </>
      ),
      checkers: look.checkers,
    };
  }
  return theme;
}

export function useFireworks(): boolean {
  const on = useSettings((s) => s.fireworks);
  const unlocked = useAchievements((s) => s.unlocked);
  return on && isUnlocked(REWARDS.fireworks, unlocked);
}

/** Whether the dice cup sound is chosen and unlocked. */
export const diceCupOn = (): boolean =>
  useSettings.getState().diceSound === "cup" &&
  isUnlocked(REWARDS.diceCup, useAchievements.getState().unlocked);

/** Avatar frames: icon and ring colour; the achievement comes from the protocol (FRAMES). */
export const FRAME_LOOK: Record<Frame, { icon: string; ring: string }> = {
  // the "Clubraum" materials: brass, olive, terracotta, bone, slate
  gold: { icon: "👑", ring: "ring-[#c9a14a]" },
  laurel: { icon: "🌿", ring: "ring-[#7d9a5a]" },
  flame: { icon: "🔥", ring: "ring-[#d1603d]" },
  star: { icon: "🌟", ring: "ring-[#e6d6a3]" },
  scholar: { icon: "🎓", ring: "ring-[#7c9cbb]" },
  post: { icon: "✉️", ring: "ring-[#b9a27a]" },
  handshake: { icon: "🤝", ring: "ring-[#8fb39a]" },
  shield: { icon: "🛡️", ring: "ring-[#a3836a]" },
  // rarities: double rings in brass
  rosette: { icon: "🏵️", ring: "ring-[#c9a14a] outline outline-1 outline-offset-2 outline-[#c9a14a]/60" },
  medal: { icon: "🎖️", ring: "ring-[#e3c574] outline outline-1 outline-offset-2 outline-[#d1603d]/70" },
};
