/**
 * Strength check of a network: the expert level (network) against another level.
 *
 *   pnpm --filter @tavli/ai exec tsx scripts/nn-duel.ts <variant> [games=200] [opponent=hard] [snapshot]
 *
 * With "snapshot" the network is taken from tuning/nn-<model>.packed (a running training)
 * instead of src/nets. Games are played in pairs with the same dice and colours swapped.
 */
import { readFileSync } from "node:fs";
import { seededRng, type VariantId } from "@tavli/engine";
import { type BotLevel, loadNet, NET_OF, setNet, unpackNet } from "../src";
import { playGame } from "../test/selfplay";

const [variant, gamesArg, opponentArg, source, cubeArg] = process.argv.slice(2) as [
  VariantId,
  string?,
  BotLevel?,
  string?,
  string?,
];
const games = Number(gamesArg ?? 200);
const cube = cubeArg !== "nocube";
const opponent = opponentArg ?? "hard";
if (source === "snapshot") {
  const model = NET_OF[variant];
  setNet(model, unpackNet(readFileSync(new URL(`../tuning/nn-${model}.packed`, import.meta.url), "utf8")));
} else if (!(await loadNet(variant))) {
  console.error(`no network for ${variant}`);
  process.exit(1);
}
let points = 0;
let maxCube = 1;
let wins = 0;
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  const expertSeat = i % 2;
  const levels: [BotLevel, BotLevel] = expertSeat === 0 ? ["expert", opponent] : [opponent, "expert"];
  // pairs share the dice
  const r = playGame(variant, levels, seededRng(1 + Math.floor(i / 2)), undefined, cube);
  maxCube = Math.max(maxCube, r.cube);
  const won = r.winner === expertSeat;
  if (won) wins++;
  points += won ? r.points : -r.points;
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(
  `${variant}: expert vs ${opponent}: ${wins}/${games} wins (${Math.round((100 * wins) / games)}%), ${(points / games).toFixed(3)} points/game, max cube ${maxCube}, ${secs}s`,
);
