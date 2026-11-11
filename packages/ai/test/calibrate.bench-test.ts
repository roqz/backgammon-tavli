/**
 * Fits the logistic mapping evaluation -> win probability (CONTACT_SCALE, ON_ROLL_BONUS in
 * src/evaluate.ts) on medium-vs-medium self-play:
 *   pnpm --filter @tavli/ai bench -t calibrate
 */
import { opponent, type Player, seededRng, type VariantId } from "@tavli/engine";
import { describe, it } from "vitest";
import { evaluate, isContact } from "../src";
import { playGame } from "./selfplay";

declare const console: { log: (...args: unknown[]) => void };

const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];
const GAMES = 150;

describe("calibrate", () => {
  for (const variant of VARIANTS) {
    it(`calibrate ${variant}`, () => {
      const rng = seededRng(99);
      const samples: { e: number; won: number }[] = [];
      for (let g = 0; g < GAMES; g++) {
        const pending: { e: number; p: Player }[] = [];
        const r = playGame(variant, ["medium", "medium"], rng, (s) => {
          if (s.phase !== "rolling" || !isContact(variant, s.board)) return;
          pending.push({ e: evaluate(variant, s.board, s.turn, opponent(s.turn)), p: s.turn });
        });
        for (const x of pending) samples.push({ e: x.e, won: x.p === r.winner ? 1 : 0 });
      }
      let best = { s: 0, b: 0, loss: Number.POSITIVE_INFINITY };
      for (let s = 4; s <= 80; s += 2) {
        for (let b = -10; b <= 20; b += 1) {
          let loss = 0;
          for (const x of samples) {
            const p = Math.min(1 - 1e-6, Math.max(1e-6, 1 / (1 + Math.exp(-(x.e + b) / s))));
            loss -= x.won ? Math.log(p) : Math.log(1 - p);
          }
          if (loss < best.loss) best = { s, b, loss };
        }
      }
      console.log(
        `${variant.padEnd(10)} samples=${samples.length} scale=${best.s} onRollBonus=${best.b} logloss=${(best.loss / samples.length).toFixed(4)}`,
      );
    }, 900_000);
  }
});
