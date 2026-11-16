import { isDraw } from "@tavli/engine";
/**
 * Lasting progress beyond single achievements (see docs/GAMIFICATION.md):
 * - career counters that outlive the local archive (which keeps only the latest games),
 * - weekly tasks and the tokens they earn, exchanged for looks in the showcase,
 * - variant plaques (bronze, silver, gold), seasons and the club rank.
 * Everything is cosmetic and stored on the device; with an online profile it is kept with the
 * profile (merged: higher counters win, lists are united).
 */
import {
  CAREER_VARIANTS,
  type Career,
  type CareerVariant,
  CLUB_RANKS,
  clubPoints,
  clubRank,
  EMPTY_CAREER,
  mergeCareer,
} from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { humanSeat } from "./bot/useBotDriver";
import type { GameRecord } from "./store/archive";

export { CLUB_RANKS, clubPoints, clubRank };

// ---- the store -----------------------------------------------------------------------------------

interface CareerStore extends Career {
  /** Date of the newest archived game already counted ("" = none yet). */
  seen: string;
  /** Counts archived games newer than `seen`. */
  count: (records: readonly GameRecord[]) => void;
  /** Finished correspondence games (all, and those of a league), as listed by the server. */
  setCorr: (finished: number, league: number) => void;
  challenge: (friendId: string) => void;
  markTasks: (week: string, done: readonly number[]) => void;
  take: (item: string) => boolean;
  /** Takes over another device's career (no announcement). */
  absorb: (other: Career) => void;
}

const careerOf = (s: CareerStore): Career => ({
  games: s.games,
  wins: s.wins,
  winsBy: s.winsBy,
  corrFinished: s.corrFinished,
  leagueGames: s.leagueGames,
  expertWins: s.expertWins ?? 0,
  challenged: s.challenged,
  weeks: s.weeks,
  owned: s.owned,
});

export const useCareer = create<CareerStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_CAREER,
      seen: "",
      count: (records) => {
        const s = get();
        const fresh = records.filter((r) => r.date > s.seen);
        if (fresh.length === 0) return;
        let { games, wins } = s;
        let expertWins = s.expertWins ?? 0;
        const winsBy = { ...s.winsBy };
        for (const r of fresh) {
          const seat = humanSeat(r.players);
          if (seat === null) continue; // two players on one device: nobody's career
          games++;
          if (!isDraw(r.result) && r.result.winner === seat) {
            wins++;
            const v = r.variant as CareerVariant;
            if (CAREER_VARIANTS.includes(v)) winsBy[v] = (winsBy[v] ?? 0) + 1;
            if (r.players.some((p) => p.kind === "bot" && p.level === "expert")) expertWins++;
          }
        }
        // ISO dates sort as text: the newest one counted so far
        const seen = [s.seen, ...fresh.map((r) => r.date)].sort().at(-1) ?? s.seen;
        set({ games, wins, winsBy, expertWins, seen });
      },
      setCorr: (finished, league) =>
        set((s) =>
          finished <= s.corrFinished && league <= s.leagueGames
            ? s
            : {
                corrFinished: Math.max(s.corrFinished, finished),
                leagueGames: Math.max(s.leagueGames, league),
              },
        ),
      challenge: (friendId) =>
        set((s) =>
          s.challenged.includes(friendId) || s.challenged.length >= 50
            ? s
            : { challenged: [...s.challenged, friendId] },
        ),
      markTasks: (week, done) =>
        set((s) => {
          const before = s.weeks[week] ?? [];
          const all = [...new Set([...before, ...done])].sort((a, b) => a - b);
          return all.length === before.length ? s : { weeks: { ...s.weeks, [week]: all } };
        }),
      take: (item) => {
        const s = get();
        const offer = SHOP_OFFERS.find((o) => o.id === item);
        if (!offer || s.owned.includes(item) || tokens(careerOf(s)) < offer.price) return false;
        set({ owned: [...s.owned, item] });
        return true;
      },
      absorb: (other) =>
        set((s) => {
          const merged = mergeCareer(careerOf(s), other);
          return JSON.stringify(merged) === JSON.stringify(careerOf(s)) ? s : merged;
        }),
    }),
    {
      name: "tavli.career",
      version: 1,
      partialize: (s) => ({ ...careerOf(s), seen: s.seen }),
    },
  ),
);

export const currentCareer = (): Career => careerOf(useCareer.getState());

// ---- weeks and weekly tasks ----------------------------------------------------------------------

/** ISO week of a date in local time, e.g. "2026-W46". */
export const weekId = (d = new Date()): string => {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const weekday = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - weekday + 3); // the Thursday decides the year
  const firstThursday = new Date(day.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((day.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7,
    );
  return `${day.getFullYear()}-W${String(week).padStart(2, "0")}`;
};

/** Monday 00:00 and the next Monday 00:00 (local time) of the week of a date. */
export const weekRange = (d = new Date()): [Date, Date] => {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return [start, end];
};

export type TaskKind = "win-variant" | "win" | "play" | "puzzles" | "beat-strong" | "gammon" | "online";

export interface WeeklyTask {
  readonly kind: TaskKind;
  readonly target: number;
  readonly variant?: CareerVariant;
}

const TASK_POOL: readonly TaskKind[] = [
  "win-variant",
  "win",
  "play",
  "puzzles",
  "beat-strong",
  "gammon",
  "online",
];
const TASK_TARGET: Record<TaskKind, number> = {
  "win-variant": 1,
  win: 3,
  play: 5,
  puzzles: 3,
  "beat-strong": 1,
  gammon: 1,
  online: 2,
};

/** A small deterministic generator, so every device picks the same tasks for a week. */
const seeded = (seed: string) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

/** The three tasks of a week (the same everywhere). */
export const tasksFor = (week: string): WeeklyTask[] => {
  const rnd = seeded(week);
  const pool = [...TASK_POOL];
  const out: WeeklyTask[] = [];
  while (out.length < 3) {
    const kind = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    out.push({
      kind,
      target: TASK_TARGET[kind],
      ...(kind === "win-variant"
        ? { variant: CAREER_VARIANTS[Math.floor(rnd() * CAREER_VARIANTS.length)]! }
        : {}),
    });
  }
  return out;
};

/** Progress of a task from the games and puzzles of that week: [current, target]. */
export const taskProgress = (
  task: WeeklyTask,
  records: readonly GameRecord[],
  puzzles: Record<string, { solved: boolean }>,
  [start, end]: readonly [Date, Date],
): [number, number] => {
  const inWeek = records.filter((r) => {
    const t = Date.parse(r.date);
    return t >= start.getTime() && t < end.getTime() && humanSeat(r.players) !== null;
  });
  const won = inWeek.filter((r) => !isDraw(r.result) && r.result.winner === humanSeat(r.players));
  const n = (() => {
    switch (task.kind) {
      case "win-variant":
        return won.filter((r) => r.variant === task.variant).length;
      case "win":
        return won.length;
      case "play":
        return inWeek.length;
      case "puzzles":
        return Object.entries(puzzles).filter(([day, r]) => {
          const t = new Date(`${day}T12:00:00`).getTime();
          return r.solved && t >= start.getTime() && t < end.getTime();
        }).length;
      case "beat-strong":
        return won.filter((r) =>
          r.players.some((p) => p.kind === "bot" && (p.level === "hard" || p.level === "expert")),
        ).length;
      case "gammon":
        return won.filter((r) => r.result.level >= 2).length;
      case "online":
        return inWeek.filter((r) => r.players.some((p) => p.kind === "remote")).length;
    }
  })();
  return [Math.min(n, task.target), task.target];
};

/** Tokens per week: one per task, two more when all three are done. */
export const weekTokens = (done: number): number => done + (done >= 3 ? 2 : 0);

// ---- tokens and the exchange -------------------------------------------------------------------

export type ShopKind = "checkers" | "dice" | "style" | "sound" | "roll" | "emotes";

export interface ShopItem {
  /** Also the id in `owned` (and the achievement id that unlocks the same look). */
  readonly id: string;
  readonly kind: ShopKind;
  /** The look: checker set, dice skin or board style; or the sound set or emote pack. */
  readonly look: string;
  readonly price: number;
  /** Luxury looks: only in exchange, never by an achievement. */
  readonly rare?: boolean;
  /**
   * No longer offered (achievement looks are earned, not exchanged); kept so what was taken
   * stays taken and its tokens stay spent.
   */
  readonly retired?: boolean;
}

/**
 * The exchange: only what no achievement unlocks (sound sets, emote packs, luxury looks), so
 * achievements stay the one way to their rewards.
 */
export const SHOP: readonly ShopItem[] = [
  { id: "sound-wood", kind: "sound", look: "wood", price: 5 },
  { id: "sound-stone", kind: "sound", look: "stone", price: 5 },
  { id: "sound-bells", kind: "sound", look: "bells", price: 7 },
  { id: "roll-felt", kind: "roll", look: "felt", price: 4 },
  { id: "roll-bone", kind: "roll", look: "bone", price: 5 },
  { id: "roll-marble", kind: "roll", look: "marble", price: 6 },
  { id: "emotes-kafeneio", kind: "emotes", look: "kafeneio", price: 6 },
  { id: "emotes-sport", kind: "emotes", look: "sport", price: 6 },
  // once also for tokens; whoever took them keeps them
  { id: "set-pearl", kind: "checkers", look: "pearl", price: 6, retired: true },
  { id: "set-wood", kind: "checkers", look: "wood", price: 6, retired: true },
  { id: "set-onyx", kind: "checkers", look: "onyx", price: 6, retired: true },
  { id: "set-brass", kind: "checkers", look: "brass", price: 6, retired: true },
  { id: "set-bone", kind: "checkers", look: "bone", price: 6, retired: true },
  { id: "dice-gold", kind: "dice", look: "gold", price: 4, retired: true },
  { id: "dice-ruby", kind: "dice", look: "ruby", price: 4, retired: true },
  { id: "style-night", kind: "style", look: "night", price: 8, retired: true },
  { id: "style-marble", kind: "style", look: "marble", price: 8, retired: true },
  { id: "style-tournament", kind: "style", look: "tournament", price: 8, retired: true },
  { id: "style-olive", kind: "style", look: "olive", price: 8, retired: true },
  // rarities: only here, and dear (a perfect week earns 5 tokens)
  { id: "dice-silver", kind: "dice", look: "silver", price: 12, rare: true },
  { id: "set-amber", kind: "checkers", look: "amber", price: 20, rare: true },
  { id: "style-salon", kind: "style", look: "salon", price: 30, rare: true },
];

/** What the exchange offers now. */
export const SHOP_OFFERS: readonly ShopItem[] = SHOP.filter((o) => !o.retired);

export const tokensEarned = (c: Career): number =>
  Object.values(c.weeks).reduce((s, done) => s + weekTokens(done.length), 0);

export const tokensSpent = (c: Career): number =>
  c.owned.reduce((s, id) => s + (SHOP.find((o) => o.id === id)?.price ?? 0), 0);

export const tokens = (c: Career): number => Math.max(0, tokensEarned(c) - tokensSpent(c));

/** Weeks with all three tasks done. */
export const perfectWeeks = (c: Career): number =>
  Object.values(c.weeks).filter((done) => done.length >= 3).length;

// ---- variant plaques -----------------------------------------------------------------------------

/** Wins for bronze, silver and gold. */
export const PLAQUE_WINS = [5, 25, 100] as const;

/** Achievement ids of the plaques reached, e.g. "master-plakoto-2" (silver). */
export const plaqueIds = (c: Career): string[] => {
  const ids: string[] = [];
  for (const v of CAREER_VARIANTS)
    PLAQUE_WINS.forEach((need, i) => {
      if ((c.winsBy[v] ?? 0) >= need) ids.push(`master-${v}-${i + 1}`);
    });
  if (CAREER_VARIANTS.every((v) => (c.winsBy[v] ?? 0) >= PLAQUE_WINS[2])) ids.push("master-all");
  return ids;
};

/** Highest plaque of a variant: 0 none, 1 bronze, 2 silver, 3 gold. */
export const plaqueOf = (c: Career, v: CareerVariant): number =>
  PLAQUE_WINS.filter((need) => (c.winsBy[v] ?? 0) >= need).length;

// ---- seasons -------------------------------------------------------------------------------------

/** Games to play within a season to keep its look. */
export const SEASON_GAMES = 10;

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

/** The four seasons by their first month (0 = January); each lasts three months. */
export const SEASONS: readonly { key: SeasonKey; first: number }[] = [
  { key: "spring", first: 2 },
  { key: "summer", first: 5 },
  { key: "autumn", first: 8 },
  { key: "winter", first: 11 },
];

/** Colour of the season motif (its icon is named like the season). */
export const SEASON_TINT: Record<SeasonKey, string> = {
  spring: "#f2b8c6",
  summer: "#f0d58a",
  autumn: "#e0a473",
  winter: "#cfe3f0",
};

export interface Season {
  readonly key: SeasonKey;
  /** Achievement id, named after the year the season starts in: "season-winter-2026" = Dec 2026 – Feb 2027. */
  readonly id: string;
  readonly year: number;
  readonly start: Date;
  readonly end: Date;
}

/** The season of a date (there always is one). */
export const seasonOf = (d = new Date()): Season => {
  const m = d.getMonth();
  const s = [...SEASONS].reverse().find((x) => m >= x.first) ?? SEASONS[3]!; // January, February: winter
  const year = m < s.first ? d.getFullYear() - 1 : d.getFullYear();
  return {
    key: s.key,
    id: `season-${s.key}-${year}`,
    year,
    start: new Date(year, s.first, 1),
    end: new Date(year, s.first + 3, 1),
  };
};

/** The winter season of a date (December to February), or null outside it. */
export const winterSeason = (d = new Date()): Season | null => {
  const s = seasonOf(d);
  return s.key === "winter" ? s : null;
};

/** Games (against the computer or online) within the current season. */
export const seasonGames = (records: readonly GameRecord[], d = new Date()): number => {
  const s = seasonOf(d);
  return records.filter((r) => {
    const t = Date.parse(r.date);
    return t >= s.start.getTime() && t < s.end.getTime() && humanSeat(r.players) !== null;
  }).length;
};

/** Season achievements reached (kept for good once reached). */
export const seasonIds = (records: readonly GameRecord[], d = new Date()): string[] =>
  seasonGames(records, d) >= SEASON_GAMES ? [seasonOf(d).id] : [];

/** Whether any season of this kind was completed (its board stays). */
export const hasSeason = (unlocked: Record<string, string>, key: SeasonKey): boolean =>
  Object.keys(unlocked).some((id) => id.startsWith(`season-${key}-`));

export const hasWinter = (unlocked: Record<string, string>): boolean => hasSeason(unlocked, "winter");

/** "season-autumn-2026" → its season key and year. */
export const parseSeasonId = (id: string): { key: SeasonKey; year: number } | null => {
  const m = /^season-(spring|summer|autumn|winter)-(\d{4})$/.exec(id);
  return m ? { key: m[1] as SeasonKey, year: Number(m[2]) } : null;
};

// ---- club rank -----------------------------------------------------------------------------------

/** Points, rank and how far it is to the next rank. */
export const rankInfo = (
  c: Career,
  lessons: readonly number[],
  puzzles: Record<string, { solved: boolean }>,
): { points: number; rank: number; next: number | null } => {
  const points = clubPoints({ career: c, lessons, puzzles });
  const rank = clubRank(points);
  return { points, rank, next: CLUB_RANKS[rank + 1] ?? null };
};
