/**
 * Self-play tuning of the evaluation weights with a (1+1) evolution strategy.
 *
 *   pnpm --filter @tavli/ai tune <variant> [iterations=80] [gamesPerIteration=200]
 *
 * Each iteration perturbs the relevant weights and plays paired games (same dice, colours
 * swapped) between candidate and current weights with the 1-ply bot and no cube. A candidate
 * is accepted only with a clear margin. Progress is written to tuning/<variant>.json; copy the
 * final weights into TUNED in src/weights.ts after validating them.
 */
import { writeFileSync } from "node:fs";
import {
  applyAction,
  createGame,
  type Player,
  type Rng,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { chooseMoves } from "../src/bot";
import { DEFAULT_WEIGHTS, RELEVANT_WEIGHTS, type Weights, weightsFor } from "../src/weights";

const [variant, itArg, gamesArg, mode] = process.argv.slice(2) as [VariantId, string?, string?, string?];
if (!variant || !RELEVANT_WEIGHTS[variant]) {
  console.error("usage: tune <backgammon|portes|plakoto|fevga> [iterations] [games] [validate]");
  process.exit(1);
}
const ITERATIONS = Number(itArg ?? 80);
const GAMES = Number(gamesArg ?? 200);
const ACCEPT_AT = 0.535;
const SIGMA = 0.2;

/** Plays one cube-less game; returns the winner. weights[p] are used by player p. */
const play = (weights: readonly [Weights, Weights], dice: Rng): Player => {
  let s = createGame({ variant, cube: false });
  for (let guard = 0; guard < 5000; guard++) {
    if (s.phase === "finished") return s.result!.winner;
    if (s.phase === "opening" || s.phase === "rolling") {
      s = applyAction(s, { type: "roll", dice: rollDice(dice) });
    } else if (s.phase === "moving") {
      for (const move of chooseMoves(s, "medium", dice, weights[s.turn])) {
        s = applyAction(s, { type: "move", move });
      }
      if (s.phase === "moving") s = applyAction(s, { type: "confirm" });
    }
  }
  throw new Error("game did not finish");
};

/** Candidate win rate over paired games. */
const compare = (cand: Weights, base: Weights, games: number, seed: number): number => {
  let wins = 0;
  for (let g = 0; g < games / 2; g++) {
    if (play([cand, base], seededRng(seed * 100_003 + g)) === 0) wins++;
    if (play([base, cand], seededRng(seed * 100_003 + g)) === 1) wins++;
  }
  return wins / games;
};

const gaussian = (rng: Rng) =>
  Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());

const perturb = (w: Weights, rng: Rng): Weights => {
  const out: Record<string, number> = { ...w };
  for (const k of RELEVANT_WEIGHTS[variant]) {
    const v = out[k]!;
    out[k] = Math.max(0, Number((v * (1 + SIGMA * gaussian(rng)) + 0.05 * gaussian(rng)).toFixed(3)));
  }
  return out as unknown as Weights;
};

const pick = (w: Weights) => Object.fromEntries(RELEVANT_WEIGHTS[variant].map((k) => [k, w[k]]));
const file = new URL(`../tuning/${variant}.json`, import.meta.url);

if (mode === "validate") {
  const rate = compare(weightsFor(variant), DEFAULT_WEIGHTS, GAMES, 777);
  console.log(`${variant}: tuned vs default ${(rate * 100).toFixed(1)}% over ${GAMES} games`);
  process.exit(0);
}

const rng = seededRng(2026);
let current: Weights = weightsFor(variant);
const history: { iteration: number; rate: number; accepted: boolean }[] = [];
const t0 = Date.now();
for (let it = 1; it <= ITERATIONS; it++) {
  const cand = perturb(current, rng);
  const rate = compare(cand, current, GAMES, it);
  const accepted = rate >= ACCEPT_AT;
  if (accepted) current = cand;
  history.push({ iteration: it, rate, accepted });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(
    `${variant} it ${it}/${ITERATIONS} rate ${(rate * 100).toFixed(1)}%${accepted ? " ACCEPTED" : ""} (${mins} min)`,
  );
  writeFileSync(
    file,
    `${JSON.stringify({ variant, iteration: it, weights: pick(current), history }, null, 2)}\n`,
  );
}
