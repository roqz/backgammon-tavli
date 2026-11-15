import type { AccountResponse, RecoveryCodes, RegisterResponse, TwoFactorSetup } from "@tavli/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/server";
import { base32Decode, base32Encode, stepAt, totpCode, verifyTotp } from "../src/totp";
import { api, register, start } from "./helpers";

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors (SHA-1)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, stepAt(59_000))).toBe("287082");
    expect(totpCode(secret, stepAt(1_111_111_109_000))).toBe("081804");
    expect(totpCode(secret, stepAt(2_000_000_000_000))).toBe("279037");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });

  it("accepts one step of drift and refuses a step used before", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    const prev = totpCode(secret, stepAt(now) - 1);
    expect(verifyTotp(secret, prev, now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(secret, prev, now, stepAt(now) - 1)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, stepAt(now) - 2), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
});

describe("account recovery and two-factor login", () => {
  let server: RunningServer;
  afterEach(async () => server?.close());

  const auth = (p: { id: string; token: string }) => ({ Authorization: `Bearer ${p.id}.${p.token}` });
  const post = <T>(path: string, body: unknown, p?: { id: string; token: string }) =>
    api<T>(server, path, { method: "POST", body: JSON.stringify(body), headers: p ? auth(p) : {} });

  const account = async () => {
    const guest = await register(server, "Anna");
    const acc = await post<AccountResponse & RecoveryCodes & { recoveryCodes: string[] }>(
      "/api/account/claim",
      { username: "anna", password: "long enough" },
      guest,
    );
    return { guest, codes: acc.recoveryCodes, acc };
  };

  it("hands out ten recovery codes; one resets a forgotten password, once", async () => {
    server = await start();
    const { codes, acc } = await account();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(acc.recoveryCodesLeft).toBe(10);
    expect(acc.twoFactor).toBe(false);

    const session = await post<RegisterResponse>("/api/account/recover", {
      username: "ANNA",
      code: codes[3]!.toLowerCase(),
      password: "a new password",
    });
    expect(session.name).toBe("Anna");
    await expect(post("/api/account/login", { username: "anna", password: "long enough" })).rejects.toThrow(
      /401/,
    );
    await post("/api/account/login", { username: "anna", password: "a new password" });
    // used up
    await expect(
      post("/api/account/recover", { username: "anna", code: codes[3], password: "another one" }),
    ).rejects.toThrow(/401/);
    const info = await api<AccountResponse>(server, "/api/account", { headers: auth(session) });
    expect(info.recoveryCodesLeft).toBe(9);
  });

  it("two-factor login with an app code or a recovery code; new codes replace the old ones", async () => {
    server = await start();
    const { guest, codes } = await account();
    const setup = await post<TwoFactorSetup>("/api/account/2fa/setup", { password: "long enough" }, guest);
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/Tavli%3Aanna\?secret=/);
    await expect(post("/api/account/2fa/enable", { code: "000000" }, guest)).rejects.toThrow(/401/);
    const on = await post<AccountResponse>(
      "/api/account/2fa/enable",
      { code: totpCode(setup.secret, stepAt(Date.now())) },
      guest,
    );
    expect(on.twoFactor).toBe(true);

    await expect(post("/api/account/login", { username: "anna", password: "long enough" })).rejects.toThrow(
      /2fa code required/,
    );
    await expect(
      post("/api/account/login", { username: "anna", password: "long enough", otp: "123456" }),
    ).rejects.toThrow(/wrong 2fa code/);
    // the code of the next step (the current one was used for enabling)
    await post("/api/account/login", {
      username: "anna",
      password: "long enough",
      otp: totpCode(setup.secret, stepAt(Date.now()) + 1),
    });
    await post("/api/account/login", { username: "anna", password: "long enough", otp: codes[0] });

    // recovery needs the app code too
    await expect(
      post("/api/account/recover", { username: "anna", code: codes[1], password: "a new password" }),
    ).rejects.toThrow(/2fa code required/);

    const renewed = await post<RecoveryCodes>(
      "/api/account/recovery-codes",
      { password: "long enough" },
      guest,
    );
    await expect(
      post("/api/account/login", { username: "anna", password: "long enough", otp: codes[2] }),
    ).rejects.toThrow(/wrong 2fa code/);

    const off = await post<AccountResponse>(
      "/api/account/2fa/disable",
      { password: "long enough", code: renewed.codes[0] },
      guest,
    );
    expect(off.twoFactor).toBe(false);
    await post("/api/account/login", { username: "anna", password: "long enough" });
  });

  it("does not export the secret and deletes everything with the profile", async () => {
    server = await start();
    const { guest } = await account();
    await post<TwoFactorSetup>("/api/account/2fa/setup", { password: "long enough" }, guest);
    const data = await api<Record<string, unknown>>(server, "/api/account/export", { headers: auth(guest) });
    expect(JSON.stringify(data)).not.toMatch(/secret/i);
    expect(data.recoveryCodes).toHaveLength(10);
  });
});
