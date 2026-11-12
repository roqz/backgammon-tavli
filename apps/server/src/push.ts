import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";
import type { PushLang, TournamentRef } from "@tavli/protocol";
import type { Store } from "./db";

/**
 * Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), using
 * only node:crypto. The VAPID key pair is created on first start and kept in the database, so no
 * configuration or third-party account is needed; `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (raw,
 * base64url) can pin it instead.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_player ON push_subscriptions(player_id);
`;

/** Subscriptions kept per player (one per browser/device); older ones are dropped. */
const MAX_PER_PLAYER = 5;
const TTL_SECONDS = 10 * 60;
const RECORD_SIZE = 4096;

/**
 * The server only posts to the well-known browser push services, so a subscription cannot be
 * abused to make it send requests elsewhere.
 */
export const PUSH_SERVICE_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export const isPushServiceUrl = (endpoint: string): boolean => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_SERVICE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
};

export interface PushSubscriptionInput {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  readonly lang: PushLang;
}

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  /** Notifications with the same tag replace each other. */
  readonly tag: string;
  /** Opened when the notification is clicked (relative to the app). */
  readonly url: string;
}

export interface PushOptions {
  readonly subject: string;
  readonly publicKey?: string;
  readonly privateKey?: string;
  /** Which endpoints may be used (tests allow a local receiver). */
  readonly allowEndpoint?: (endpoint: string) => boolean;
}

/** "Your tournament match is ready" in the subscriber's language. */
export const tournamentReadyMessage = (lang: PushLang, ref: TournamentRef, opponent: string): PushMessage => {
  const round = `${ref.round + 1}/${ref.rounds}`;
  return {
    title: `🏆 ${ref.name}`,
    body:
      lang === "de"
        ? `Runde ${round}: Dein Match gegen ${opponent} ist bereit. Öffne die App innerhalb von 5 Minuten, sonst verlierst du kampflos.`
        : `Round ${round}: your match against ${opponent} is ready. Open the app within 5 minutes or you lose by walkover.`,
    tag: `tournament-${ref.id}`,
    url: `./?tournament=${encodeURIComponent(ref.id)}`,
  };
};

const b64u = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
const unb64u = (s: string): Buffer => Buffer.from(s, "base64url");

interface Vapid {
  readonly publicKey: string;
  readonly key: KeyObject;
}

const keyFromRaw = (publicKey: string, privateKey: string): KeyObject => {
  const pub = unb64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4)
    throw new Error("VAPID public key must be a raw uncompressed P-256 key");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateKey,
      x: b64u(pub.subarray(1, 33)),
      y: b64u(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
};

/** RFC 8291 encryption of one record for a subscription's p256dh/auth keys. */
export const encryptPayload = (
  plaintext: Uint8Array,
  p256dh: string,
  authSecret: string,
  salt: Buffer = randomBytes(16),
): Buffer => {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // A single record: content followed by the 0x02 delimiter, no padding.
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body, cipher.getAuthTag()]);
};

/** VAPID `Authorization` header value for a push service origin. */
export const vapidAuthorization = (
  audience: string,
  subject: string,
  vapid: Vapid,
  now = Date.now(),
): string => {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(
    Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: vapid.key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`;
};

export class Push {
  private readonly vapid: Vapid;
  private readonly allow: (endpoint: string) => boolean;

  constructor(
    private readonly store: Store,
    private readonly opts: PushOptions,
    private readonly log: (msg: string) => void = () => {},
  ) {
    store.db.exec(SCHEMA);
    this.allow = opts.allowEndpoint ?? isPushServiceUrl;
    this.vapid = this.loadKeys();
  }

  get publicKey(): string {
    return this.vapid.publicKey;
  }

  private loadKeys(): Vapid {
    if (this.opts.publicKey && this.opts.privateKey)
      return { publicKey: this.opts.publicKey, key: keyFromRaw(this.opts.publicKey, this.opts.privateKey) };
    const db = this.store.db;
    const row = db.prepare("SELECT value FROM meta WHERE key = 'vapid'").get() as
      | { value: string }
      | undefined;
    if (row) {
      const { publicKey, privateKey } = JSON.parse(row.value) as { publicKey: string; privateKey: string };
      return { publicKey, key: keyFromRaw(publicKey, privateKey) };
    }
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" });
    const publicKey = b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x!), unb64u(jwk.y!)]));
    db.prepare("INSERT INTO meta (key, value) VALUES ('vapid', ?)").run(
      JSON.stringify({ publicKey, privateKey: jwk.d }),
    );
    return { publicKey, key: privateKey };
  }

  /**
   * Stores a browser subscription; returns false for an endpoint that is not a push service, or
   * one registered by another player with different keys (a known URL cannot be taken over).
   */
  subscribe(playerId: string, sub: PushSubscriptionInput): boolean {
    if (!this.allow(sub.endpoint)) return false;
    const db = this.store.db;
    const existing = db
      .prepare("SELECT player_id, p256dh, auth FROM push_subscriptions WHERE endpoint = ?")
      .get(sub.endpoint) as { player_id: string; p256dh: string; auth: string } | undefined;
    if (
      existing &&
      existing.player_id !== playerId &&
      (existing.p256dh !== sub.keys.p256dh || existing.auth !== sub.keys.auth)
    )
      return false;
    db.prepare(
      `INSERT INTO push_subscriptions (endpoint, player_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET player_id = excluded.player_id, p256dh = excluded.p256dh,
         auth = excluded.auth, lang = excluded.lang, created_at = excluded.created_at`,
    ).run(sub.endpoint, playerId, sub.keys.p256dh, sub.keys.auth, sub.lang, new Date().toISOString());
    db.prepare(
      `DELETE FROM push_subscriptions WHERE player_id = ?1 AND endpoint NOT IN
       (SELECT endpoint FROM push_subscriptions WHERE player_id = ?1 ORDER BY created_at DESC LIMIT ?2)`,
    ).run(playerId, MAX_PER_PLAYER);
    return true;
  }

  unsubscribe(playerId: string, endpoint: string): void {
    this.store.db
      .prepare("DELETE FROM push_subscriptions WHERE player_id = ? AND endpoint = ?")
      .run(playerId, endpoint);
  }

  hasSubscription(playerId: string): boolean {
    return !!this.store.db.prepare("SELECT 1 FROM push_subscriptions WHERE player_id = ?").get(playerId);
  }

  /** Sends a notification to all devices of a player, built per subscription language. */
  async send(playerId: string, message: (lang: PushLang) => PushMessage): Promise<number> {
    const subs = this.store.db
      .prepare("SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE player_id = ?")
      .all(playerId) as { endpoint: string; p256dh: string; auth: string; lang: PushLang }[];
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        if (!this.allow(s.endpoint)) return;
        try {
          const body = encryptPayload(Buffer.from(JSON.stringify(message(s.lang))), s.p256dh, s.auth);
          const res = await fetch(s.endpoint, {
            method: "POST",
            headers: {
              Authorization: vapidAuthorization(new URL(s.endpoint).origin, this.opts.subject, this.vapid),
              "Content-Encoding": "aes128gcm",
              "Content-Type": "application/octet-stream",
              TTL: String(TTL_SECONDS),
              Urgency: "high",
            },
            body,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          if (res.status === 404 || res.status === 410) this.unsubscribe(playerId, s.endpoint);
          else if (res.ok) delivered++;
          else this.log(`push to ${new URL(s.endpoint).host} failed: ${res.status}`);
        } catch (e) {
          this.log(`push to ${new URL(s.endpoint).host} failed: ${String(e)}`);
        }
      }),
    );
    return delivered;
  }
}
