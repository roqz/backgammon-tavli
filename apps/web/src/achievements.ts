import { isDraw, type MatchVariant } from "@tavli/engine";
import {
  type Career,
  type CareerVariant,
  CLUB_RANKS,
  clubPoints,
  type ProfileResponse,
  type TournamentView,
} from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { humanSeat } from "./bot/useBotDriver";
import { parseSeasonId, perfectWeeks, SEASONS, type SeasonKey } from "./career";
import type { IconName } from "./components/Icon";
import { variantShortName } from "./components/VariantPicker";
import type { Dict, Lang } from "./i18n";
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
  /** Lasting counters (career.ts). */
  readonly career: Career;
}

export interface Achievement {
  readonly id: string;
  /** Emoji for plain text (notifications, titles); the plaque draws `badge`. */
  readonly icon: string;
  /** Motif of the plaque (components/Icon.tsx). */
  readonly badge: IconName;
  /** Colour of the motif (checker sets: their material); brass-white otherwise. */
  readonly tint?: string;
  readonly title: Record<Lang, string>;
  readonly text: Record<Lang, string>;
  /** Progress towards the goal: [current, target]. */
  readonly progress: (c: AchievementContext) => readonly [number, number];
  /** A rarity: months or years of play, shown in its own showcase section. */
  readonly rare?: boolean;
}

/** Games the local player won (vs the computer or online), with the result. */
const wins = (c: AchievementContext) =>
  c.records.filter((r) => {
    const seat = humanSeat(r.players);
    return seat !== null && !isDraw(r.result) && r.result.winner === seat;
  });

const vsBotWins = (c: AchievementContext, level?: string) =>
  wins(c).filter((r) => r.players.some((p) => p.kind === "bot" && (!level || p.level === level)));

const count = (n: number, target: number) => [Math.min(n, target), target] as const;

const careerWins = (c: AchievementContext, ...variants: CareerVariant[]) =>
  variants.reduce((s, v) => s + (c.career.winsBy[v] ?? 0), 0);

/** Won games with something special about them. */
const wonWith = (c: AchievementContext, test: (r: GameRecord, seat: 0 | 1) => boolean) =>
  c.records.some((r) => {
    const seat = humanSeat(r.players);
    return seat !== null && r.result.winner === seat && test(r, seat);
  });

const doubleSixes = (r: GameRecord, seat: 0 | 1) =>
  r.history.filter((t) => t.kind === "move" && t.player === seat && t.dice[0] === 6 && t.dice[1] === 6)
    .length;
const flag = (ok: boolean) => [ok ? 1 : 0, 1] as const;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-win",
    icon: "🎉",
    badge: "fireworks",
    title: { de: "Erster Sieg", en: "First win" },
    text: { de: "Gewinne ein Spiel.", en: "Win a game." },
    progress: (c) => count(wins(c).length, 1),
  },
  {
    id: "ten-wins",
    icon: "🏅",
    badge: "medal",
    title: { de: "Zehn Siege", en: "Ten wins" },
    text: { de: "Gewinne 10 Spiele.", en: "Win 10 games." },
    progress: (c) => count(wins(c).length, 10),
  },
  {
    id: "fifty-wins",
    icon: "🏆",
    badge: "trophy",
    title: { de: "Alter Hase", en: "Old hand" },
    text: { de: "Gewinne 50 Spiele.", en: "Win 50 games." },
    progress: (c) => count(wins(c).length, 50),
  },
  {
    id: "beat-hard",
    icon: "🤖",
    badge: "robot",
    title: { de: "Maschine besiegt", en: "Beat the machine" },
    text: { de: "Gewinne gegen den starken Computer.", en: "Beat the strong computer." },
    progress: (c) => count(vsBotWins(c, "hard").length + vsBotWins(c, "expert").length, 1),
  },
  {
    id: "beat-expert",
    icon: "🧠",
    badge: "network",
    title: { de: "Netz zerrissen", en: "Net breaker" },
    text: { de: "Gewinne ein Spiel gegen den Experten (KI).", en: "Win a game against the expert (AI)." },
    progress: (c) => count(vsBotWins(c, "expert").length, 1),
  },
  {
    id: "gammon",
    icon: "💥",
    badge: "burst",
    title: { de: "Gammon!", en: "Gammon!" },
    text: { de: "Gewinne ein Spiel doppelt (Gammon / Mars).", en: "Win a double game (gammon / mars)." },
    progress: (c) => flag(wins(c).some((r) => r.result.level >= 2)),
  },
  {
    id: "backgammon",
    icon: "🌋",
    badge: "volcano",
    title: { de: "Backgammon!", en: "Backgammon!" },
    text: { de: "Gewinne ein Backgammon (dreifach).", en: "Win a backgammon (triple)." },
    progress: (c) => flag(wins(c).some((r) => r.result.level === 3)),
  },
  {
    id: "all-variants",
    icon: "🎲",
    badge: "dice",
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
    badge: "school",
    title: { de: "Ausgelernt", en: "Graduate" },
    text: { de: "Löse alle Lektionen des Tutorials.", en: "Solve every tutorial lesson." },
    progress: (c) => count(c.lessonsSolved, c.lessonsTotal),
  },
  {
    id: "puzzle",
    icon: "🧩",
    badge: "puzzle",
    title: { de: "Rätselfreund", en: "Puzzler" },
    text: { de: "Löse ein Tagesrätsel.", en: "Solve a daily puzzle." },
    progress: (c) => count(Object.values(c.puzzles).filter((p) => p.solved).length, 1),
  },
  {
    id: "puzzle-week",
    icon: "🔥",
    badge: "flame",
    title: { de: "Eine Woche dran", en: "Week streak" },
    text: { de: "Löse das Tagesrätsel 7 Tage in Folge.", en: "Solve the daily puzzle 7 days in a row." },
    progress: (c) => count(streak(c.puzzles), 7),
  },
  {
    id: "puzzle-month",
    icon: "🌟",
    badge: "star",
    title: { de: "Ein Monat dran", en: "Month streak" },
    text: { de: "Löse das Tagesrätsel 30 Tage in Folge.", en: "Solve the daily puzzle 30 days in a row." },
    progress: (c) => count(streak(c.puzzles), 30),
  },
  {
    id: "online-win",
    icon: "🌐",
    badge: "globe",
    title: { de: "Online gewonnen", en: "Online winner" },
    text: { de: "Gewinne ein Online-Match.", en: "Win an online match." },
    progress: (c) => count(c.profile?.ratings.reduce((s, r) => s + r.wins, 0) ?? 0, 1),
  },
  {
    id: "rating-1600",
    icon: "📈",
    badge: "trend-up",
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
    badge: "crown",
    title: { de: "Turniersieger", en: "Champion" },
    text: { de: "Gewinne ein Turnier.", en: "Win a tournament." },
    progress: (c) => flag(!!c.me && c.tournaments.some((t) => t.status === "finished" && t.winner === c.me)),
  },
  {
    id: "league-win",
    icon: "🏟️",
    badge: "shield",
    title: { de: "Meister", en: "League champion" },
    text: { de: "Gewinne eine Club-Liga.", en: "Win a club league." },
    progress: (c) => count(c.profile?.leaguesWon ?? 0, 1),
  },
  {
    id: "month-winner",
    icon: "🏆",
    badge: "trophy",
    title: { de: "Monatssieger", en: "Monthly champion" },
    text: {
      de: "Werde Erster einer Monatswertung (Rating-Gewinn im Monat).",
      en: "Top a monthly ranking (rating gained in a month).",
    },
    progress: (c) => flag(!!c.profile?.trophies?.some((x) => x.place === 1)),
  },
  {
    id: "variant-master",
    icon: "🏛️",
    badge: "points",
    title: { de: "Variantenmeister", en: "Variant master" },
    text: {
      de: "Erreiche Rating 1600 in Portes, Plakoto und Fevga.",
      en: "Reach a rating of 1600 in Portes, Plakoto and Fevga.",
    },
    progress: (c) =>
      count(
        (["portes", "plakoto", "fevga"] as const).filter((v) =>
          c.profile?.ratings.some((r) => r.variant === v && !r.pool && r.rating >= 1600 && r.matches > 0),
        ).length,
        3,
      ),
    rare: true,
  },
  {
    id: "tournament-three",
    icon: "👑",
    badge: "crown",
    title: { de: "Turnierserie", en: "Tournament series" },
    text: { de: "Gewinne drei Turniere.", en: "Win three tournaments." },
    progress: (c) =>
      count(c.me ? c.tournaments.filter((t) => t.status === "finished" && t.winner === c.me).length : 0, 3),
    rare: true,
  },
  {
    id: "veteran",
    icon: "⏳",
    badge: "hourglass",
    title: { de: "Veteran", en: "Veteran" },
    text: {
      de: "Zwei Jahre dabei und 300 Online-Matches gespielt.",
      en: "Two years with the game and 300 online matches played.",
    },
    progress: (c) => {
      const matches = c.profile?.ratings.reduce((s, r) => s + r.matches, 0) ?? 0;
      const since = c.profile?.since ? Date.parse(`${c.profile.since}-01T00:00:00Z`) : Date.now();
      const old = Date.now() - since >= 730 * 24 * 60 * 60 * 1000;
      // both conditions: without the two years it stays one short of the goal
      return [Math.max(0, Math.min(matches, 300) - (old ? 0 : 1)), 300];
    },
    rare: true,
  },
  // ---- checker sets: wins per variant (career counters, beyond the archive) ----
  {
    id: "set-pearl",
    icon: "⚪",
    badge: "checker",
    tint: "#f3ede0",
    title: { de: "Perlmutt-Steine", en: "Mother-of-pearl checkers" },
    text: { de: "Gewinne 10 Spiele Backgammon.", en: "Win 10 games of backgammon." },
    progress: (c) => count(careerWins(c, "backgammon"), 10),
  },
  {
    id: "set-wood",
    icon: "🪵",
    badge: "checker",
    tint: "#c08a55",
    title: { de: "Olivenholz-Steine", en: "Olive wood checkers" },
    text: { de: "Gewinne 10 Spiele Plakoto.", en: "Win 10 games of plakoto." },
    progress: (c) => count(careerWins(c, "plakoto"), 10),
  },
  {
    id: "set-onyx",
    icon: "⚫",
    badge: "checker",
    tint: "#9aa0a6",
    title: { de: "Onyx & Alabaster", en: "Onyx & alabaster" },
    text: { de: "Gewinne 10 Spiele Fevga.", en: "Win 10 games of fevga." },
    progress: (c) => count(careerWins(c, "fevga"), 10),
  },
  {
    id: "set-brass",
    icon: "🟡",
    badge: "checker",
    tint: "#c9a14a",
    title: { de: "Messing-Steine", en: "Brass checkers" },
    text: { de: "Gewinne 10 Spiele Portes oder Tavla.", en: "Win 10 games of portes or tavla." },
    progress: (c) => count(careerWins(c, "portes", "tavla"), 10),
  },
  {
    id: "set-bone",
    icon: "🦴",
    badge: "checker",
    tint: "#e8dcc0",
    title: { de: "Bein & Ebenholz", en: "Bone & ebony" },
    text: { de: "Gewinne 10 Spiele Narde oder Hypergammon.", en: "Win 10 games of narde or hypergammon." },
    progress: (c) => count(careerWins(c, "narde", "hypergammon"), 10),
  },
  // ---- special moments ----
  {
    id: "comeback",
    icon: "🔄",
    badge: "rematch",
    title: { de: "Comeback", en: "Comeback" },
    text: {
      de: "Gewinne ein Match, in dem du mit 4 Punkten zurücklagst.",
      en: "Win a match in which you were 4 points behind.",
    },
    progress: (c) =>
      flag(
        c.records.some((r) => {
          const seat = humanSeat(r.players);
          return seat !== null && r.matchEnd?.winner === seat && r.matchEnd.maxDeficit[seat] >= 4;
        }),
      ),
  },
  {
    id: "double-sixes",
    icon: "🎲",
    badge: "dice",
    title: { de: "Sechser-Regen", en: "Raining sixes" },
    text: {
      de: "Würfle in einem gewonnenen Spiel dreimal 6-6.",
      en: "Roll 6-6 three times in a game you win.",
    },
    progress: (c) => flag(wonWith(c, (r, seat) => doubleSixes(r, seat) >= 3)),
  },
  {
    id: "mana",
    icon: "📌",
    badge: "pin",
    title: { de: "Mutter eingeklemmt", en: "Mother pinned" },
    text: {
      de: "Gewinne Plakoto, indem du den letzten Startstein des Gegners einklemmst.",
      en: "Win plakoto by pinning the opponent's last starting checker.",
    },
    progress: (c) => flag(wonWith(c, (r) => r.result.reason === "mana")),
  },
  {
    id: "cube-eight",
    icon: "🎯",
    badge: "cube",
    title: { de: "Hoch gepokert", en: "High stakes" },
    text: {
      de: "Gewinne ein Spiel mit dem Verdopplungswürfel auf 8 oder höher.",
      en: "Win a game with the cube on 8 or higher.",
    },
    progress: (c) => flag(wonWith(c, (r) => r.result.cube >= 8)),
  },
  // ---- online (frames and the league dice) ----
  {
    id: "corr-ten",
    icon: "✉️",
    badge: "corr",
    title: { de: "Briefpartner", en: "Pen pal" },
    text: { de: "Spiele 10 Fernpartien zu Ende.", en: "Finish 10 correspondence games." },
    progress: (c) => count(c.career.corrFinished, 10),
  },
  {
    id: "friends-five",
    icon: "🤝",
    badge: "handshake",
    title: { de: "Gesellig", en: "Sociable" },
    text: {
      de: "Fordere 5 verschiedene Freunde heraus (live oder als Fernpartie).",
      en: "Challenge 5 different friends (live or by correspondence).",
    },
    progress: (c) => count(c.career.challenged.length, 5),
  },
  {
    id: "league-player",
    icon: "🏟️",
    badge: "club",
    title: { de: "Ligaspieler", en: "League player" },
    text: { de: "Spiele eine Ligapartie zu Ende.", en: "Finish a league game." },
    progress: (c) => count(c.career.leagueGames, 1),
  },
  {
    id: "analyst",
    icon: "🔍",
    badge: "search",
    title: { de: "Analytiker", en: "Analyst" },
    text: { de: "Lass eine Partie analysieren.", en: "Have a game analysed." },
    // unlocked by the replay screen (an action, not a state)
    progress: () => [0, 1],
  },
  // ---- rarities: long-term goals with looks that cannot be exchanged ----
  {
    id: "puzzles-100",
    icon: "🗝️",
    badge: "key",
    title: { de: "Rätselmeister", en: "Puzzle master" },
    text: { de: "Löse 100 Tagesrätsel.", en: "Solve 100 daily puzzles." },
    progress: (c) => count(Object.values(c.puzzles).filter((p) => p.solved).length, 100),
    rare: true,
  },
  {
    id: "expert-25",
    icon: "🦾",
    badge: "network",
    title: { de: "Netzbezwinger", en: "Net tamer" },
    text: { de: "Gewinne 25 Spiele gegen den Experten (KI).", en: "Win 25 games against the expert (AI)." },
    progress: (c) => count(Math.max(c.career.expertWins ?? 0, vsBotWins(c, "expert").length), 25),
    rare: true,
  },
  {
    id: "perfect-12",
    icon: "📜",
    badge: "scroll",
    title: { de: "Pflichtbewusst", en: "Dutiful" },
    text: {
      de: "Erledige in 12 Wochen alle drei Wochenaufgaben.",
      en: "Complete all three weekly tasks in 12 weeks.",
    },
    progress: (c) => count(perfectWeeks(c.career), 12),
    rare: true,
  },
  {
    id: "wins-500",
    icon: "💎",
    badge: "gem",
    title: { de: "Großmeister", en: "Grandmaster" },
    text: { de: "Gewinne 500 Spiele.", en: "Win 500 games." },
    progress: (c) => count(Math.max(c.career.wins, wins(c).length), 500),
    rare: true,
  },
  {
    id: "honor-member",
    icon: "🎖️",
    badge: "medal",
    title: { de: "Ehrenmitglied", en: "Honorary member" },
    text: {
      de: `Erreiche den höchsten Clubrang (${CLUB_RANKS.at(-1)} Punkte).`,
      en: `Reach the highest club rank (${CLUB_RANKS.at(-1)} points).`,
    },
    progress: (c) =>
      count(
        clubPoints({
          career: c.career,
          lessons: Array.from({ length: c.lessonsSolved }, (_, i) => i),
          puzzles: c.puzzles,
        }),
        CLUB_RANKS.at(-1)!,
      ),
    rare: true,
  },
  {
    id: "games-1000",
    icon: "🏛️",
    badge: "rosette",
    title: { de: "Inventar", en: "Part of the furniture" },
    text: { de: "Spiele 1000 Partien.", en: "Play 1000 games." },
    progress: (c) => count(c.career.games, 1000),
    rare: true,
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

/** "Wintersaison 2026/27", "Herbstsaison 2026". */
export const seasonLabel = (t: Dict, s: { key: SeasonKey; year: number }): string =>
  t.seasonLabel
    .replace("{season}", t.seasonNames[s.key])
    .replace(
      "{year}",
      s.key === "winter" ? `${s.year}/${String((s.year + 1) % 100).padStart(2, "0")}` : String(s.year),
    );

/** Icon and title of anything that can be unlocked (achievements, plaques, seasons), for the toast. */
/** What a fresh unlock shows: the plaque where there is one, else the emoji (seasons). */
export interface UnlockView {
  readonly icon: string;
  readonly title: string;
  readonly badge?: IconName;
  readonly tint?: string;
  readonly rare?: boolean;
}

export const describeUnlock = (id: string, t: Dict, lang: Lang): UnlockView | null => {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) return { icon: a.icon, title: a.title[lang], badge: a.badge, tint: a.tint, rare: a.rare };
  const plaque = /^master-([a-z]+)-([123])$/.exec(id);
  if (plaque) {
    const tier = Number(plaque[2]) - 1;
    return {
      icon: ["🥉", "🥈", "🥇"][tier]!,
      badge: "points",
      tint: ["#e0a473", "#e3e0d6", "#f0d58a"][tier],
      title: t.plaqueTitle
        .replace("{tier}", t.plaqueTiers[tier]!)
        .replace("{variant}", variantShortName(plaque[1] as MatchVariant)),
    };
  }
  if (id === "master-all")
    return { icon: "🏛️", title: t.masterAll, badge: "points", tint: "#f0d58a", rare: true };
  const season = parseSeasonId(id);
  if (season) return { icon: SEASONS.find((s) => s.key === season.key)!.icon, title: seasonLabel(t, season) };
  return null;
};
