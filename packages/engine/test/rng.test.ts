import { describe, expect, it } from "vitest";
import { cryptoRng, rollDice, rollDie, seededRng } from "../src";

describe("random numbers", () => {
  it("seeded generator is reproducible and differs between seeds", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });

  it("dice are uniform: every face about 1/6 (chi-squared over 60 000 rolls)", () => {
    for (const rng of [seededRng(7), cryptoRng]) {
      const counts = [0, 0, 0, 0, 0, 0];
      const n = 60_000;
      for (let i = 0; i < n; i++) counts[rollDie(rng) - 1]!++;
      const expected = n / 6;
      const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
      // 5 degrees of freedom: p = 0.001 at 20.5
      expect(chi2).toBeLessThan(20.5);
    }
  });

  it("rolls two dice in range", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 1000; i++) {
      const [d1, d2] = rollDice(rng);
      expect(d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6).toBe(true);
    }
  });
});
