/**
 * Fits and checks the gammon model P(gammon | win) = σ(a + b·z + c·outside) on self-play
 * (medium vs medium, no cube, so games are played out):
 *   GAMES=300 pnpm --filter @tavli/ai bench -- gammon
 */
import { opponent, seededRng, type VariantId } from "@tavli/engine";
import { describe, it } from "vitest";
import { outcomes } from "../src";
import { gammonFeatures } from "../src/evaluate";
import { playGame } from "./selfplay";

const VARIANTS: VariantId[] = ["backgammon", "portes", "plakoto", "fevga"];
const GAMES = Number(process.env.GAMES ?? 150);

interface Sample {
  readonly x: [number, number, number]; // 1, z, outside
  readonly y: number;
  readonly predicted: number;
}

const sigmoid = (t: number) => 1 / (1 + Math.exp(-t));

/** Logistic regression by Newton's method (3 parameters). */
const fitLogistic = (samples: readonly Sample[]): number[] => {
  let w = [0, 0, 0];
  for (let iter = 0; iter < 30; iter++) {
    const g = [0, 0, 0];
    const h = [
      [1e-6, 0, 0],
      [0, 1e-6, 0],
      [0, 0, 1e-6],
    ];
    for (const { x, y } of samples) {
      const p = sigmoid(w[0]! * x[0] + w[1]! * x[1] + w[2]! * x[2]);
      for (let i = 0; i < 3; i++) {
        g[i]! += (y - p) * x[i]!;
        for (let j = 0; j < 3; j++) h[i]![j]! += p * (1 - p) * x[i]! * x[j]!;
      }
    }
    w = w.map((wi, i) => wi + solve3(h, g)[i]!);
  }
  return w;
};

const solve3 = (m: number[][], v: number[]): number[] => {
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m);
  return [0, 1, 2].map((c) => det(m.map((row, r) => row.map((x, k) => (k === c ? v[r]! : x)))) / d);
};

describe("gammon model", () => {
  for (const variant of VARIANTS) {
    it(variant, () => {
      const rng = seededRng(Number(process.env.SEED ?? 4242));
      const samples: Sample[] = [];
      let gammons = 0;
      for (let g = 0; g < GAMES; g++) {
        const pending: { p: 0 | 1; x: Sample["x"]; predicted: number }[] = [];
        const r = playGame(
          variant,
          ["medium", "medium"],
          rng,
          (s) => {
            if (s.phase !== "rolling") return;
            const p = opponent(s.turn); // just moved; the opponent is on roll
            const f = gammonFeatures(variant, s.board, p);
            if (!f) return;
            pending.push({
              p,
              x: [1, f.z, f.outside],
              predicted: outcomes(variant, s.board, p, s.turn).gammonWin,
            });
          },
          false,
        );
        if (r.level >= 2) gammons++;
        for (const s of pending)
          if (s.p === r.winner) samples.push({ x: s.x, y: r.level >= 2 ? 1 : 0, predicted: s.predicted });
      }
      const w = fitLogistic(samples);
      const bins = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, actual: 0 }));
      for (const s of samples) {
        const b = bins[Math.min(9, Math.floor(s.predicted * 10))]!;
        b.n++;
        b.predicted += s.predicted;
        b.actual += s.y;
      }
      const rows = bins
        .map((b, i) =>
          b.n
            ? `${i}: n=${b.n} pred=${(b.predicted / b.n).toFixed(2)} actual=${(b.actual / b.n).toFixed(2)}`
            : "",
        )
        .filter(Boolean);
      console.log(
        `${variant}: gammon rate ${((100 * gammons) / GAMES).toFixed(0)}%, fit a=${w[0]!.toFixed(2)} b=${w[1]!.toFixed(2)} c=${w[2]!.toFixed(2)}\n  current model:\n  ${rows.join("\n  ")}`,
      );
    }, 1_200_000);
  }
});
