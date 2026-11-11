import type { Dice } from "./types";

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Small, fast seeded PRNG (mulberry32) for reproducible games, tests and bot self-play. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Cryptographically secure RNG (Web Crypto, available in browsers and Node >= 19). */
interface WebCrypto {
  getRandomValues(array: Uint32Array): Uint32Array;
}

export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  (globalThis as unknown as { crypto: WebCrypto }).crypto.getRandomValues(buf);
  return buf[0]! / 4294967296;
};

export const rollDie = (rng: Rng): number => 1 + Math.floor(rng() * 6);

export const rollDice = (rng: Rng): Dice => [rollDie(rng), rollDie(rng)];
