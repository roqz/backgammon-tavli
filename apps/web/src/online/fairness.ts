import type { TurnRecord } from "@tavli/engine";
import { diceFromDigest, type FairnessReveal, fairRollMessage } from "@tavli/protocol";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => new Uint8Array(s.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? []);

/** This client's contribution to the dice randomness. */
export const newClientSeed = (): string => hex(crypto.getRandomValues(new Uint8Array(16)));

/**
 * Checks the revealed dice of an online match:
 * 1. the revealed server seed matches the commitment published at match start,
 * 2. every roll follows from the seeds (HMAC-SHA256),
 * 3. our own seed was used,
 * 4. the dice of the given game histories appear in the roll log, in order.
 */
export const verifyDice = async (
  commit: string,
  reveal: FairnessReveal,
  mySeed: string | null,
  histories: readonly (readonly TurnRecord[])[],
): Promise<boolean> => {
  const seed = fromHex(reveal.serverSeed);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
  if (hex(digest) !== commit || reveal.commit !== commit) return false;
  if (mySeed && !reveal.clientSeeds.includes(mySeed)) return false;

  const key = await crypto.subtle.importKey("raw", seed, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  for (const [i, roll] of reveal.rolls.entries()) {
    let dice: [number, number] | null = null;
    for (let extra = ""; !dice && extra.length < 8; extra += "+") {
      const mac = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(fairRollMessage(reveal.clientSeeds, i, extra)),
      );
      dice = diceFromDigest(new Uint8Array(mac));
    }
    if (!dice || dice[0] !== roll[0] || dice[1] !== roll[1]) return false;
  }

  let cursor = 0;
  for (const rec of histories.flat()) {
    if (rec.kind !== "move") continue;
    while (
      cursor < reveal.rolls.length &&
      !(reveal.rolls[cursor]![0] === rec.dice[0] && reveal.rolls[cursor]![1] === rec.dice[1])
    ) {
      cursor++;
    }
    if (cursor >= reveal.rolls.length) return false;
    cursor++;
  }
  return true;
};
