import { describe, expect, it } from "vitest";
import {
  ClaimSchema,
  ClientMessageSchema,
  cleanName,
  DeleteAccountSchema,
  diceFromDigest,
  fairRollMessage,
  NameSchema,
  PushSubscribeSchema,
  swissRounds,
} from "../src";

describe("client messages", () => {
  it("accepts valid messages and rejects unknown or malformed ones", () => {
    expect(ClientMessageSchema.safeParse({ t: "queue", variant: "portes", length: 3 }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ t: "queue", variant: "chess", length: 3 }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ t: "queue", variant: "portes", length: 4 }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ t: "nope" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ t: "join", code: "x".repeat(100) }).success).toBe(false);
  });

  it("validates tournaments: size, name, format", () => {
    const base = { t: "tournament-create", name: "Cup", variant: "backgammon", length: 1, size: 8 };
    expect(ClientMessageSchema.safeParse(base).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ ...base, format: "swiss" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ ...base, format: "round-robin" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ ...base, size: 6 }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ ...base, name: "x".repeat(41) }).success).toBe(false);
  });

  it("only allows the defined actions", () => {
    const action = (a: unknown) => ClientMessageSchema.safeParse({ t: "action", action: a }).success;
    expect(action({ type: "roll" })).toBe(true);
    expect(action({ type: "resign", level: 2 })).toBe(true);
    expect(action({ type: "resign", level: 4 })).toBe(false);
    // dice never come from the client
    expect(action({ type: "roll", dice: [6, 6] })).toBe(true);
    const parsed = ClientMessageSchema.parse({ t: "action", action: { type: "roll", dice: [6, 6] } });
    expect("dice" in (parsed as { action: object }).action).toBe(false);
  });
});

describe("names and accounts", () => {
  it("cleans names and refuses reserved ones", () => {
    expect(cleanName(" a\u0000b‮c  d ")).toBe("abc d");
    expect(NameSchema.safeParse({ name: "Moderator" }).success).toBe(false);
    expect(NameSchema.safeParse({ name: "x".repeat(25) }).success).toBe(false);
    expect(NameSchema.parse({ name: "  Eleni " }).name).toBe("Eleni");
  });

  it("checks usernames, passwords and e-mail", () => {
    expect(ClaimSchema.safeParse({ username: "anna_1", password: "12345678" }).success).toBe(true);
    expect(ClaimSchema.safeParse({ username: "a", password: "12345678" }).success).toBe(false);
    expect(ClaimSchema.safeParse({ username: "anna_1", password: "short" }).success).toBe(false);
    expect(ClaimSchema.safeParse({ username: "anna_1", password: "12345678", email: "nope" }).success).toBe(
      false,
    );
    expect(ClaimSchema.safeParse({ username: "anna_1", password: "12345678", email: "" }).success).toBe(true);
    expect(DeleteAccountSchema.safeParse({}).success).toBe(true);
  });

  it("accepts browser push subscriptions only in the expected shape", () => {
    const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
    expect(
      PushSubscribeSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys, lang: "de" }).success,
    ).toBe(true);
    expect(PushSubscribeSchema.safeParse({ endpoint: "not a url", keys, lang: "de" }).success).toBe(false);
    expect(
      PushSubscribeSchema.safeParse({ endpoint: "https://x.y/z", keys: { ...keys, auth: "!!" }, lang: "de" })
        .success,
    ).toBe(false);
    expect(PushSubscribeSchema.safeParse({ endpoint: "https://x.y/z", keys, lang: "fr" }).success).toBe(
      false,
    );
  });
});

describe("fair dice", () => {
  it("maps digest bytes to dice without bias", () => {
    expect(diceFromDigest(new Uint8Array([0, 5]))).toEqual([1, 6]);
    // bytes >= 252 are skipped (252 = 42 · 6 keeps every face equally likely)
    expect(diceFromDigest(new Uint8Array([255, 252, 7, 251]))).toEqual([2, 6]);
    expect(diceFromDigest(new Uint8Array([253, 254]))).toBeNull();
    // every face is reached by exactly 42 byte values
    const counts = [0, 0, 0, 0, 0, 0];
    for (let b = 0; b < 252; b++) counts[diceFromDigest(new Uint8Array([b, 0]))![0] - 1]!++;
    expect(counts).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it("roll messages include both client seeds and the roll index", () => {
    expect(fairRollMessage(["aa", "bb"], 3)).toBe("aa:bb:3");
    expect(fairRollMessage(["aa", "bb"], 3, ":retry")).toBe("aa:bb:3:retry");
  });
});

describe("tournaments", () => {
  it("Swiss rounds: 3 up to 8 players, 4 with 16", () => {
    expect([4, 8, 16].map(swissRounds)).toEqual([3, 3, 4]);
  });
});
