/**
 * Two-factor login with authenticator apps (TOTP, RFC 6238: HMAC-SHA1, 30 s steps, 6 digits)
 * and one-time recovery codes. No e-mail involved: the recovery codes are the way back into an
 * account whose password is forgotten.
 */
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (buf: Buffer): string => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (s: string): Buffer => {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

export const STEP_SECONDS = 30;

/** A new shared secret (160 bits, as recommended by RFC 4226). */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** The 6-digit code of a time step. */
export const totpCode = (secret: string, step: number): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
};

export const stepAt = (ms: number): number => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Checks a code against the current step and one step either side (clock drift). Returns the
 * matching step, or null. Steps up to `lastStep` were used already and are refused (no replay).
 */
export const verifyTotp = (secret: string, code: string, now: number, lastStep = -1): number | null => {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const current = stepAt(now);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastStep) continue;
    if (totpCode(secret, step) === digits) return step;
  }
  return null;
};

/** otpauth:// link for authenticator apps (and the QR code shown to the player). */
export const otpauthUri = (issuer: string, account: string, secret: string): string =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ---- recovery codes -------------------------------------------------------------------------

/** Without 0/O, 1/I/L: easy to write down and type. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_CODES = 10;

/** One code like "K7QM-2XRP-9D" (10 characters, about 50 bits). */
const recoveryCode = (): string => {
  let s = "";
  for (let i = 0; i < 10; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
};

/** Friend invitation code: 8 characters of the same alphabet (about 40 bits). */
export const inviteCode = (): string => {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
};

export const newRecoveryCodes = (): string[] => Array.from({ length: RECOVERY_CODES }, recoveryCode);

/** Normalised (case, dashes, spaces) and hashed for storage. */
export const hashRecoveryCode = (code: string): string =>
  createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "")).digest("hex");

/** Whether a string looks like a recovery code rather than a 6-digit TOTP code. */
export const looksLikeRecoveryCode = (s: string): boolean => s.replace(/[\s-]/g, "").length === 10;
