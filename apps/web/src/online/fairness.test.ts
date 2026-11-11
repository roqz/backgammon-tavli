import type { TurnRecord } from "@tavli/engine";
import { diceFromDigest, type FairnessReveal, fairRollMessage } from "@tavli/protocol";
import { describe, expect, it } from "vitest";
import { newClientSeed, verifyDice } from "./fairness";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Builds a reveal the way the server does (with WebCrypto instead of node:crypto). */
const makeReveal = async (count: number): Promise<FairnessReveal> => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const commit = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", seed)));
  const clientSeeds: [string, string] = [newClientSeed(), newClientSeed()];
  const key = await crypto.subtle.importKey("raw", seed, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const rolls: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(fairRollMessage(clientSeeds, i)),
    );
    rolls.push(diceFromDigest(new Uint8Array(mac))!);
  }
  return { commit, serverSeed: hex(seed), clientSeeds, rolls };
};

const moveRecord = (dice: readonly [number, number]): TurnRecord => ({
  kind: "move",
  player: 0,
  dice,
  moves: [],
});

describe("verifyDice", () => {
  it("accepts an honest reveal and history", async () => {
    const r = await makeReveal(6);
    const history = [moveRecord(r.rolls[1]!), moveRecord(r.rolls[3]!), moveRecord(r.rolls[4]!)];
    expect(await verifyDice(r.commit, r, r.clientSeeds[0], [history])).toBe(true);
  });

  it("rejects a changed roll", async () => {
    const r = await makeReveal(4);
    const first = r.rolls[0]!;
    const tampered = {
      ...r,
      rolls: [[first[0] === 6 ? 1 : first[0] + 1, first[1]] as const, ...r.rolls.slice(1)],
    };
    expect(await verifyDice(r.commit, tampered, null, [])).toBe(false);
  });

  it("rejects a seed that does not match the commitment", async () => {
    const r = await makeReveal(2);
    const other = await makeReveal(2);
    expect(await verifyDice(other.commit, r, null, [])).toBe(false);
  });

  it("rejects when our own seed was not used", async () => {
    const r = await makeReveal(2);
    expect(await verifyDice(r.commit, r, newClientSeed(), [])).toBe(false);
  });

  it("rejects a history with dice that were never rolled", async () => {
    const r = await makeReveal(3);
    const fake = r.rolls.some((d) => d[0] === 6 && d[1] === 6) ? ([1, 1] as const) : ([6, 6] as const);
    const unrolled = r.rolls.some((d) => d[0] === fake[0] && d[1] === fake[1]);
    if (unrolled) return; // extremely unlikely; nothing to test
    expect(await verifyDice(r.commit, r, null, [[moveRecord(fake)]])).toBe(false);
  });
});
