/**
 * Match equity table (MET): the chance to win a match from a score, given how many points each
 * side still needs.
 *
 * Pre-Crawford scores up to 7-away use the published Kazaross XG2 table (rounded to 0.1 %),
 * because checker play is sensitive to the *differences* between neighbouring scores (they set
 * the value of a gammon) and a simple model gets those wrong by enough to cost games. Everything
 * else is computed from a documented model that reproduces the published Crawford and
 * post-Crawford values within ~1 %:
 *
 * - Every game is won by either side with probability 1/2; a win is a single game with
 *   probability 1 - G, a gammon with G - B and a backgammon with B (G includes B).
 * - Pre-Crawford games (cube variants) are counted at value 2: in practice the cube is usually
 *   turned once and taken, and this volatility is what helps the trailer.
 * - Crawford game: played without cube.
 * - Post-Crawford (cube variants): the trailer doubles at once; the leader takes or drops,
 *   whatever is better for them (this produces the known "free drop" at even-away scores).
 * - Variants without a doubling cube (Tavli) have no Crawford distinction: every game counts
 *   its value, with the variant's own gammon (mars) rate measured in self-play.
 *
 * Longer matches recurse onto the table, so they stay consistent with it.
 */

/** Share of games won with a gammon (including backgammons), about the rate in expert play. */
export const MET_GAMMON_RATE = 0.27;
/** Share of games won with a backgammon. */
export const MET_BACKGAMMON_RATE = 0.015;

export type MatchPhase = "pre" | "crawford" | "post";

/** Gammon (mars) rates of the Tavli variants, measured in self-play without cube. */
export const CUBELESS_GAMMON_RATE: Readonly<Record<string, number>> = {
  portes: 0.16,
  plakoto: 0.33,
  fevga: 0.13,
  tavla: 0.16,
  narde: 0.13,
};

/** Kazaross XG2, pre-Crawford, chance of the player needing `i` against `j` (i < j). */
const PUBLISHED: Readonly<Record<string, number>> = {
  "2:3": 0.598,
  "2:4": 0.66,
  "2:5": 0.743,
  "2:6": 0.792,
  "2:7": 0.841,
  "3:4": 0.571,
  "3:5": 0.644,
  "3:6": 0.702,
  "3:7": 0.754,
  "4:5": 0.564,
  "4:6": 0.624,
  "4:7": 0.682,
  "5:6": 0.56,
  "5:7": 0.616,
  "6:7": 0.553,
};

const published = (me: number, opp: number): number | undefined => {
  if (me === opp) return 0.5;
  const v = PUBLISHED[`${Math.min(me, opp)}:${Math.max(me, opp)}`];
  return v === undefined ? undefined : me < opp ? v : 1 - v;
};

const memo = new Map<string, number>();

/**
 * Chance that the player needing `me` points wins against one needing `opp` points.
 * `phase` is the state of the *next* game; `cube` = the variant uses a doubling cube.
 */
export const matchEquity = (
  me: number,
  opp: number,
  phase: MatchPhase = "pre",
  cube = true,
  gammonRate = MET_GAMMON_RATE,
): number => {
  if (me <= 0) return 1;
  if (opp <= 0) return 0;
  if (!cube) phase = "pre";
  // A Crawford or post-Crawford state only exists once somebody is 1-away.
  if (phase !== "pre" && me !== 1 && opp !== 1) phase = "pre";
  if (phase === "pre" && cube && (me === 1 || opp === 1)) phase = "crawford";
  if (me === 1 && opp === 1) return 0.5;
  if (phase === "pre" && cube && gammonRate === MET_GAMMON_RATE && me <= 7 && opp <= 7) {
    const table = published(me, opp);
    if (table !== undefined) return table;
  }
  const key = `${me}:${opp}:${phase}:${cube ? 1 : 0}:${gammonRate}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  // Next state after a game; a pre-Crawford game that brings someone to 1-away leads to the Crawford game.
  const next = (m: number, o: number): number => {
    if (m <= 0) return 1;
    if (o <= 0) return 0;
    if (!cube) return matchEquity(m, o, "pre", false, gammonRate);
    if (phase === "pre") return matchEquity(m, o, m === 1 || o === 1 ? "crawford" : "pre", true, gammonRate);
    return matchEquity(m, o, "post", true, gammonRate);
  };
  const BACKGAMMON = cube ? MET_BACKGAMMON_RATE : 0;
  const SINGLE = 1 - gammonRate;
  const GAMMON = gammonRate - BACKGAMMON;
  /** Value of one game played for `v` points (cubeless). */
  const game = (v: number): number =>
    0.5 * (SINGLE * next(me - v, opp) + GAMMON * next(me - 2 * v, opp) + BACKGAMMON * next(me - 3 * v, opp)) +
    0.5 * (SINGLE * next(me, opp - v) + GAMMON * next(me, opp - 2 * v) + BACKGAMMON * next(me, opp - 3 * v));

  let value: number;
  if (phase === "post") {
    // The trailer doubles immediately; the leader chooses between taking and dropping.
    const leaderIsMe = me === 1;
    const take = game(2);
    const drop = leaderIsMe ? next(me, opp - 1) : next(me - 1, opp);
    value = leaderIsMe ? Math.max(take, drop) : Math.min(take, drop);
  } else value = game(phase === "pre" && cube ? 2 : 1);

  memo.set(key, value);
  return value;
};
