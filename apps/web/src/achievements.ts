import type { ProfileResponse, TournamentView } from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { humanSeat } from "./bot/useBotDriver";
import type { Lang } from "./i18n";
import { PUZZLE_VARIANTS, streak } from "./puzzle";
import type { GameRecord } from "./store/archive";

/** Everything the achievements are computed from. */
export interface AchievementContext {
  readonly records: readonly GameRecord[];
  readonly puzzles: Record<string, { solved: boolean; loss: number }>;
  readonly lessonsSolved: number;
  readonly lessonsTotal: number;
  readonly profile: ProfileResponse | null;
  readonly tournaments: readonly TournamentView[];
  readonly me: string | null;
}

interface Achievement {
  readonly id: string;
  readonly icon: string;
  readonly title: Record<Lang, string>;
  readonly text: Record<Lang, string>;
  /** Progress towards the goal: [current, target]. */
  readonly progress: (c: AchievementContext) => readonly [number, number];
}

/** Games the local player won (vs the computer or online), with the result. */
const wins = (c: AchievementContext) =>
  c.records.filter((r) => {
    const seat = humanSeat(r.players);
    return seat !== null && r.result.winner === seat;
  });

const vsBotWins = (c: AchievementContext, level?: string) =>
  wins(c).filter((r) => r.players.some((p) => p.kind === "bot" && (!level || p.level === level)));

const count = (n: number, target: number) => [Math.min(n, target), target] as const;
const flag = (ok: boolean) => [ok ? 1 : 0, 1] as const;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-win",
    icon: "🎉",
    title: { de: "Erster Sieg", en: "First win" },
    text: { de: "Gewinne ein Spiel.", en: "Win a game." },
    progress: (c) => count(wins(c).length, 1),
  },
  {
    id: "ten-wins",
    icon: "🏅",
    title: { de: "Zehn Siege", en: "Ten wins" },
    text: { de: "Gewinne 10 Spiele.", en: "Win 10 games." },
    progress: (c) => count(wins(c).length, 10),
  },
  {
    id: "fifty-wins",
    icon: "🏆",
    title: { de: "Alter Hase", en: "Old hand" },
    text: { de: "Gewinne 50 Spiele.", en: "Win 50 games." },
    progress: (c) => count(wins(c).length, 50),
  },
  {
    id: "beat-hard",
    icon: "🤖",
    title: { de: "Maschine besiegt", en: "Beat the machine" },
    text: { de: "Gewinne gegen den starken Computer.", en: "Beat the strong computer." },
    progress: (c) => count(vsBotWins(c, "hard").length + vsBotWins(c, "expert").length, 1),
  },
  {
    id: "beat-expert",
    icon: "🧠",
    title: { de: "Netz zerrissen", en: "Net breaker" },
    text: { de: "Gewinne ein Spiel gegen den Experten (KI).", en: "Win a game against the expert (AI)." },
    progress: (c) => count(vsBotWins(c, "expert").length, 1),
  },
  {
    id: "gammon",
    icon: "💥",
    title: { de: "Gammon!", en: "Gammon!" },
    text: { de: "Gewinne ein Spiel doppelt (Gammon / Mars).", en: "Win a double game (gammon / mars)." },
    progress: (c) => flag(wins(c).some((r) => r.result.level >= 2)),
  },
  {
    id: "backgammon",
    icon: "🌋",
    title: { de: "Backgammon!", en: "Backgammon!" },
    text: { de: "Gewinne ein Backgammon (dreifach).", en: "Win a backgammon (triple)." },
    progress: (c) => flag(wins(c).some((r) => r.result.level === 3)),
  },
  {
    id: "all-variants",
    icon: "🎲",
    title: { de: "Tavli-Kenner", en: "Tavli connoisseur" },
    text: {
      de: "Gewinne in jeder Variante: Backgammon, Portes, Plakoto und Fevga.",
      en: "Win in every variant: Backgammon, Portes, Plakoto and Fevga.",
    },
    progress: (c) => count(new Set(wins(c).map((r) => r.variant)).size, PUZZLE_VARIANTS.length),
  },
  {
    id: "tutorial",
    icon: "🎓",
    title: { de: "Ausgelernt", en: "Graduate" },
    text: { de: "Löse alle Lektionen des Tutorials.", en: "Solve every tutorial lesson." },
    progress: (c) => count(c.lessonsSolved, c.lessonsTotal),
  },
  {
    id: "puzzle",
    icon: "🧩",
    title: { de: "Rätselfreund", en: "Puzzler" },
    text: { de: "Löse ein Tagesrätsel.", en: "Solve a daily puzzle." },
    progress: (c) => count(Object.values(c.puzzles).filter((p) => p.solved).length, 1),
  },
  {
    id: "puzzle-week",
    icon: "🔥",
    title: { de: "Eine Woche dran", en: "Week streak" },
    text: { de: "Löse das Tagesrätsel 7 Tage in Folge.", en: "Solve the daily puzzle 7 days in a row." },
    progress: (c) => count(streak(c.puzzles), 7),
  },
  {
    id: "puzzle-month",
    icon: "🌟",
    title: { de: "Ein Monat dran", en: "Month streak" },
    text: { de: "Löse das Tagesrätsel 30 Tage in Folge.", en: "Solve the daily puzzle 30 days in a row." },
    progress: (c) => count(streak(c.puzzles), 30),
  },
  {
    id: "online-win",
    icon: "🌐",
    title: { de: "Online gewonnen", en: "Online winner" },
    text: { de: "Gewinne ein Online-Match.", en: "Win an online match." },
    progress: (c) => count(c.profile?.ratings.reduce((s, r) => s + r.wins, 0) ?? 0, 1),
  },
  {
    id: "rating-1600",
    icon: "📈",
    title: { de: "Aufsteiger", en: "Climber" },
    text: {
      de: "Erreiche ein Rating von 1600 in einer Variante.",
      en: "Reach a rating of 1600 in a variant.",
    },
    progress: (c) => count(Math.max(1500, ...(c.profile?.ratings.map((r) => r.rating) ?? [])) - 1500, 100),
  },
  {
    id: "tournament-win",
    icon: "👑",
    title: { de: "Turniersieger", en: "Champion" },
    text: { de: "Gewinne ein Turnier.", en: "Win a tournament." },
    progress: (c) => flag(!!c.me && c.tournaments.some((t) => t.status === "finished" && t.winner === c.me)),
  },
  {
    id: "league-win",
    icon: "🏟️",
    title: { de: "Meister", en: "League champion" },
    text: { de: "Gewinne eine Club-Liga.", en: "Win a club league." },
    progress: (c) => count(c.profile?.leaguesWon ?? 0, 1),
  },
  {
    id: "analyst",
    icon: "🔍",
    title: { de: "Analytiker", en: "Analyst" },
    text: { de: "Lass eine Partie analysieren.", en: "Have a game analysed." },
    // unlocked by the replay screen (an action, not a state)
    progress: () => [0, 1],
  },
];

interface AchievementStore {
  /** id → date unlocked (ISO). */
  unlocked: Record<string, string>;
  /** Tutorial lessons solved (by index). */
  lessons: number[];
  /** Newly unlocked, waiting to be announced. */
  fresh: string[];
  unlock: (ids: readonly string[]) => void;
  solveLesson: (index: number) => void;
  dismiss: () => void;
  /** Takes over what another device unlocked (no announcement). */
  absorb: (unlocked: Record<string, string>, lessons: readonly number[]) => void;
}

export const useAchievements = create<AchievementStore>()(
  persist(
    (set) => ({
      unlocked: {},
      lessons: [],
      fresh: [],
      unlock: (ids) =>
        set((s) => {
          const added = ids.filter((id) => !s.unlocked[id]);
          if (added.length === 0) return s;
          const now = new Date().toISOString();
          return {
            unlocked: { ...s.unlocked, ...Object.fromEntries(added.map((id) => [id, now])) },
            fresh: [...s.fresh, ...added],
          };
        }),
      solveLesson: (index) =>
        set((s) => (s.lessons.includes(index) ? s : { lessons: [...s.lessons, index] })),
      dismiss: () => set((s) => ({ fresh: s.fresh.slice(1) })),
      absorb: (unlocked, lessons) =>
        set((s) => {
          const u = { ...s.unlocked, ...unlocked };
          const l = [...new Set([...s.lessons, ...lessons])].sort((a, b) => a - b);
          const same =
            Object.keys(u).length === Object.keys(s.unlocked).length && l.length === s.lessons.length;
          return same ? s : { unlocked: u, lessons: l };
        }),
    }),
    {
      name: "tavli.achievements",
      version: 1,
      partialize: (s) => ({ unlocked: s.unlocked, lessons: s.lessons }),
    },
  ),
);

/** Achievements whose goal is reached in this context. */
export const reached = (c: AchievementContext): string[] =>
  ACHIEVEMENTS.filter((a) => {
    const [n, target] = a.progress(c);
    return target > 0 && n >= target;
  }).map((a) => a.id);
