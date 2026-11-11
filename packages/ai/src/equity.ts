import { type CrawfordState, type GameState, getVariant, opponent, type Player } from "@tavli/engine";
import type { Outcomes } from "./evaluate";
import { CUBELESS_GAMMON_RATE, type MatchPhase, MET_GAMMON_RATE, matchEquity } from "./met";

export interface MatchContext {
  /** 0 = unlimited money session. */
  readonly length: number;
  readonly score: readonly [number, number];
  readonly crawford: CrawfordState;
}

export const MONEY: MatchContext = { length: 0, score: [0, 0], crawford: "pending" };

/**
 * What a result is worth to a player: `u(k)` for winning `k` points (k < 0: the opponent wins
 * -k points). Money play counts points; in a match it is the chance to win the match afterwards,
 * taken from the match equity table, so gammons that cannot matter (or matter a lot) are valued
 * correctly.
 */
export type Utility = (k: number) => number;

export const utilityFor = (s: GameState, p: Player, m: MatchContext): Utility => {
  if (m.length === 0) return (k) => k;
  const cube = getVariant(s.variant).cube;
  const gammonRate = cube ? MET_GAMMON_RATE : (CUBELESS_GAMMON_RATE[s.variant] ?? MET_GAMMON_RATE);
  const needMe = m.length - m.score[p];
  const needOpp = m.length - m.score[opponent(p)];
  // State of the next game: after the Crawford game everything is post-Crawford.
  const after = (me: number, opp: number): number => {
    if (me <= 0) return 1;
    if (opp <= 0) return 0;
    const phase: MatchPhase =
      m.crawford === "pending" ? (me === 1 || opp === 1 ? "crawford" : "pre") : "post";
    return matchEquity(me, opp, phase, cube, gammonRate);
  };
  return (k) => (k >= 0 ? after(needMe - k, needOpp) : after(needMe, needOpp + k));
};

/** Gammons count unless the Jacoby rule applies (money game, cube not yet turned). */
export const gammonsCount = (s: GameState): boolean => !(s.jacoby && s.cube.enabled && s.cube.value === 1);

/** Expected utility of a position's outcomes when the game is played for `cube`. */
export const expectedUtility = (o: Outcomes, cube: number, u: Utility, gammons = true): number => {
  const gw = gammons ? o.gammonWin : 0;
  const bw = gammons ? o.backgammonWin : 0;
  const gl = gammons ? o.gammonLoss : 0;
  const bl = gammons ? o.backgammonLoss : 0;
  return (
    o.win * ((1 - gw) * u(cube) + (gw - bw) * u(2 * cube) + bw * u(3 * cube)) +
    (1 - o.win) * ((1 - gl) * u(-cube) + (gl - bl) * u(-2 * cube) + bl * u(-3 * cube))
  );
};
