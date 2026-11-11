/**
 * A/B self-play for the equity-based bot:
 *   - money (no cube): gammon-aware vs. playing for the win only, points per game
 *   - matches: cube decisions with the match equity table vs. money cube logic, match wins
 *     (AB_MODE=none: both sides identical, as a noise control)
 *   GAMES=200 MATCHES=100 SEED=7 LEVEL=medium pnpm --filter @tavli/ai bench -- equity
 */
import {
  applyAction,
  applyMatchAction,
  createGame,
  createMatch,
  type MatchState,
  type Player,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { describe, it } from "vitest";
import { type BotLevel, chooseMoves, type MatchContext, MONEY, shouldDouble, shouldTake } from "../src";

const GAMES = Number(process.env.GAMES ?? 200);
const MATCHES = Number(process.env.MATCHES ?? 100);
const LEVEL = (process.env.LEVEL ?? "medium") as BotLevel;
const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];
/** "cube" (default) or "none" for a control run with identical bots. */
const MODE = process.env.AB_MODE ?? "cube";

/** Money game without cube; side `a` (gammon-aware) vs `b` (win only). Returns points of a minus b. */
const moneyGame = (variant: VariantId, aSeat: Player, rng: () => number): number => {
  let s = createGame({ variant, cube: false });
  for (let guard = 0; guard < 4000 && s.phase !== "finished"; guard++) {
    if (s.phase === "opening" || s.phase === "rolling")
      s = applyAction(s, { type: "roll", dice: rollDice(rng) });
    else if (s.phase === "moving") {
      const gammons = s.turn === aSeat;
      for (const move of chooseMoves(s, LEVEL, rng, undefined, { gammons }))
        s = applyAction(s, { type: "move", move });
      if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
    }
  }
  const r = s.result!;
  return r.winner === aSeat ? r.points : -r.points;
};

const ctxOf = (m: MatchState): MatchContext => ({
  length: m.config.length,
  score: m.score,
  crawford: m.crawford,
});

/** One match; seat `aSeat` takes cube decisions by match score, the other as in a money game. Returns the winner. */
const playMatch = (variant: VariantId, length: number, aSeat: Player, rng: () => number): Player => {
  let m = createMatch({ variant, length });
  for (let guard = 0; guard < 100_000 && m.winner === null; guard++) {
    const s = m.game;
    const ctxFor = (p: Player) => (p === aSeat && MODE === "cube" ? ctxOf(m) : MONEY);
    switch (s.phase) {
      case "finished":
        m = applyMatchAction(m, { type: "next-game" });
        break;
      case "opening":
        m = applyMatchAction(m, { type: "roll", dice: rollDice(rng) });
        break;
      case "rolling":
        m = shouldDouble(s, LEVEL, ctxFor(s.turn))
          ? applyMatchAction(m, { type: "double" })
          : applyMatchAction(m, { type: "roll", dice: rollDice(rng) });
        break;
      case "cube-offered": {
        const taker: Player = s.turn === 0 ? 1 : 0;
        m = applyMatchAction(m, { type: shouldTake(s, LEVEL, ctxFor(taker)) ? "take" : "drop" });
        break;
      }
      case "moving":
        for (const move of chooseMoves(s, LEVEL, rng, undefined, {})) {
          m = applyMatchAction(m, { type: "move", move });
          if (m.game.phase !== "moving") break;
        }
        if (m.game.phase === "moving") m = applyMatchAction(m, { type: "confirm" });
        break;
    }
  }
  return m.winner!;
};

describe(`equity bot (${LEVEL})`, () => {
  for (const variant of VARIANTS) {
    it(`${variant}: gammon-aware vs win-only, no cube`, () => {
      const rng = seededRng(99);
      let diff = 0;
      let sq = 0;
      for (let i = 0; i < GAMES; i++) {
        const d = moneyGame(variant, (i % 2) as Player, rng);
        diff += d;
        sq += d * d;
      }
      const mean = diff / GAMES;
      const se = Math.sqrt((sq / GAMES - mean * mean) / GAMES);
      console.log(
        `${variant.padEnd(10)} gammon-aware: ${mean >= 0 ? "+" : ""}${mean.toFixed(3)} ± ${se.toFixed(3)} points/game (${GAMES} games)`,
      );
    }, 3_600_000);
  }

  // Tavli variants have no cube, so only Backgammon is compared.
  for (const [variant, length] of [["backgammon", 5]] as const) {
    it(`${variant} ${length}-point matches: match-aware vs match-blind`, () => {
      const rng = seededRng(Number(process.env.SEED ?? 7));
      let wins = 0;
      for (let i = 0; i < MATCHES; i++)
        if (playMatch(variant, length, (i % 2) as Player, rng) === i % 2) wins++;
      const p = wins / MATCHES;
      console.log(
        `[${MODE}] ${variant} ${length}pt match-aware wins ${wins}/${MATCHES} = ${(100 * p).toFixed(1)}% ± ${(100 * Math.sqrt((p * (1 - p)) / MATCHES)).toFixed(1)}`,
      );
    }, 3_600_000);
  }
});
