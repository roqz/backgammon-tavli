/**
 * Calibrates the fair-play analysis: the bot levels play each other (without cube) and every
 * non-forced decision is analysed like on the server (agreement with the expert, loss with the
 * network). Prints agreement and average loss per level plus the spread over blocks of decisions.
 *   pnpm exec tsx scripts/fairplay-calibrate.ts <variant> [games per pairing] [block]
 */
import {
  applyAction,
  canConfirm,
  createGame,
  type GameState,
  rollDice,
  seededRng,
  type VariantId,
} from "@tavli/engine";
import { analyseTurn, type BotLevel, chooseMoves, loadAllNets } from "../src";

const variant = (process.argv[2] ?? "backgammon") as VariantId;
const games = Number(process.argv[3] ?? 20);
const block = Number(process.argv[4] ?? 50);
await loadAllNets();

type Tally = { decisions: number; agree: number; loss: number; flags: boolean[] };
const tally: Record<string, Tally> = {};
const add = (level: BotLevel, agrees: boolean, loss: number) => {
  const t = (tally[level] ??= { decisions: 0, agree: 0, loss: 0, flags: [] });
  t.decisions++;
  if (agrees) t.agree++;
  t.loss += loss;
  t.flags.push(agrees);
};

const pairings: [BotLevel, BotLevel][] = [
  ["easy", "hard"],
  ["medium", "hard"],
  ["medium", "expert"],
];
const rng = seededRng(20261116);
for (const pair of pairings) {
  for (let g = 0; g < games; g++) {
    const levels: [BotLevel, BotLevel] = g % 2 ? [pair[1], pair[0]] : pair;
    let s: GameState = createGame({ variant, starter: 0, cube: false });
    while (s.phase === "opening") s = applyAction(s, { type: "roll", dice: rollDice(rng) });
    for (let i = 0; i < 400 && s.phase !== "finished"; i++) {
      if (s.phase === "rolling") {
        s = applyAction(s, { type: "roll", dice: rollDice(rng) });
        continue;
      }
      if (s.phase !== "moving") break;
      const start = s;
      const level = levels[s.turn];
      for (const m of chooseMoves(s, level, rng)) s = applyAction(s, { type: "move", move: m });
      const a = analyseTurn(start, s.board);
      if (a) add(level, a.agrees, a.loss);
      if (s.phase === "moving" && canConfirm(s)) s = applyAction(s, { type: "confirm" });
    }
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
for (const [level, t] of Object.entries(tally)) {
  const blocks: number[] = [];
  for (let i = 0; i + block <= t.flags.length; i += block)
    blocks.push(t.flags.slice(i, i + block).filter(Boolean).length / block);
  blocks.sort((a, b) => a - b);
  const q = (p: number) =>
    blocks.length ? pct(blocks[Math.min(blocks.length - 1, Math.floor(p * blocks.length))]!) : "-";
  console.log(
    `${variant} ${level}: ${t.decisions} decisions, agreement ${pct(t.agree / t.decisions)}, ` +
      `loss ${(t.loss / t.decisions).toFixed(4)}/decision; blocks of ${block}: min ${q(0)}, median ${q(0.5)}, max ${q(1)}`,
  );
}
