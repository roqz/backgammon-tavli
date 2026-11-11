/**
 * Strength benchmark between bot levels. Not part of the regular test run:
 *   pnpm --filter @tavli/ai bench
 */
import { seededRng, type VariantId } from "@tavli/engine";
import { describe, it } from "vitest";

declare const console: { log: (...args: unknown[]) => void };

import type { BotLevel } from "../src";
import { duel } from "./selfplay";

const MATCHUPS: [BotLevel, BotLevel, number][] = [
  ["medium", "easy", 60],
  ["hard", "medium", 24],
];
const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];

describe("bot strength", () => {
  for (const variant of VARIANTS) {
    for (const [a, b, games] of MATCHUPS) {
      it(`${variant}: ${a} vs ${b}`, () => {
        const t0 = Date.now();
        const r = duel(variant, a, b, games, seededRng(variant.length * 1000 + games));
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `${variant.padEnd(10)} ${a} vs ${b}: ${r.aWins}/${r.games} wins (${Math.round((100 * r.aWins) / r.games)}%), points ${r.points[a]}:${r.points[b]}, ${secs}s`,
        );
      }, 600_000);
    }
  }
});
