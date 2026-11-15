/**
 * Supporting the project (Lichess model): the game stays complete and free; supporters get a
 * badge next to their name, a frame and a board. No payments run through the app: the operator
 * links to an external donation page (SUPPORT_URL) and grants support by hand or hands out
 * one-time codes. See docs/SUPPORT.md.
 */
import { createHash, randomInt } from "node:crypto";
import {
  type AdminSupporter,
  type AdminSupportOverview,
  SUPPORTER_LIFETIME,
  type SupportInfo,
} from "@tavli/protocol";
import { AccountError, type Store, SUPPORTER_ACTIVE } from "./db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS supporter_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  months INTEGER NOT NULL,
  source TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supporter_grants_player ON supporter_grants(player_id, created_at);
CREATE TABLE IF NOT EXISTS supporter_codes (
  code_hash TEXT PRIMARY KEY,
  months INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  redeemed_by TEXT REFERENCES players(id),
  redeemed_at TEXT
);
`;

/** Without 0/O and 1/I/L, like the recovery codes. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const newCode = (): string => {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `SUPP-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
};

const hashCode = (code: string): string =>
  createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "").replace(/^SUPP/, "")).digest("hex");

/** `months` after a date (0 = for good). */
export const extend = (from: Date, months: number): string => {
  if (months === 0) return SUPPORTER_LIFETIME;
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
};

export interface SupportConfig {
  /** External page for donations (Ko-fi, Liberapay, GitHub Sponsors …). */
  readonly url?: string;
  /** Monthly running costs in euros, shown for transparency. */
  readonly monthlyCost?: number;
}

export class Supporters {
  constructor(
    private readonly store: Store,
    private readonly config: SupportConfig = {},
  ) {
    store.db.exec(SCHEMA);
    store.supportEnabled = this.enabled;
  }

  /** On only with a donation page configured; until then the app shows nothing of it. */
  get enabled(): boolean {
    return !!this.config.url;
  }

  private get db() {
    return this.store.db;
  }

  /**
   * Adds support: from today, or from the end of a running period (so nothing is lost when a
   * code is redeemed early). A lifetime grant stays lifetime.
   */
  grant(playerId: string, months: number, source: "admin" | "code", note = "", now = new Date()): void {
    const row = this.db
      .prepare("SELECT supporter_since, supporter_until FROM players WHERE id = ? AND deleted_at IS NULL")
      .get(playerId) as { supporter_since: string | null; supporter_until: string | null } | undefined;
    if (!row) throw new AccountError(404, "unknown player");
    const running = row.supporter_until && row.supporter_until > now.toISOString();
    const until =
      row.supporter_until === SUPPORTER_LIFETIME
        ? SUPPORTER_LIFETIME
        : extend(running ? new Date(row.supporter_until!) : now, months);
    // "since" counts from the start of the current, unbroken period
    const since = running && row.supporter_since ? row.supporter_since : now.toISOString();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE players SET supporter_since = ?, supporter_until = ? WHERE id = ?")
        .run(since, until, playerId);
      this.db
        .prepare(
          "INSERT INTO supporter_grants (player_id, months, source, note, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(playerId, months, source, note, now.toISOString());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Ends the support now (refunds, mistakes); the grants stay in the log. */
  revoke(playerId: string, now = new Date()): boolean {
    // a second in the past: SQLite's clock may run a few milliseconds behind the process clock
    const ended = new Date(now.getTime() - 1000).toISOString();
    return (
      this.db
        .prepare(
          "UPDATE players SET supporter_until = ? WHERE id = ? AND supporter_until IS NOT NULL AND supporter_until > ?",
        )
        .run(ended, playerId, now.toISOString()).changes === 1
    );
  }

  /** One-time codes for the operator to hand out (shown once; only hashes are kept). */
  createCodes(count: number, months: number, note = "", now = new Date()): string[] {
    const codes = Array.from({ length: count }, newCode);
    const insert = this.db.prepare(
      "INSERT INTO supporter_codes (code_hash, months, note, created_at) VALUES (?, ?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      for (const c of codes) insert.run(hashCode(c), months, note, now.toISOString());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return codes;
  }

  /** Redeems a code for a player; each code works once. */
  redeem(playerId: string, code: string, now = new Date()): number {
    const hash = hashCode(code);
    const row = this.db
      .prepare("SELECT months, note FROM supporter_codes WHERE code_hash = ? AND redeemed_by IS NULL")
      .get(hash) as { months: number; note: string } | undefined;
    if (!row) throw new AccountError(404, "code not valid");
    const taken = this.db
      .prepare(
        "UPDATE supporter_codes SET redeemed_by = ?, redeemed_at = ? WHERE code_hash = ? AND redeemed_by IS NULL",
      )
      .run(playerId, now.toISOString(), hash).changes;
    if (taken !== 1) throw new AccountError(404, "code not valid");
    this.grant(playerId, row.months, "code", row.note, now);
    return row.months;
  }

  /** Named in the public thank-you list, or not (default: not). */
  setPublic(playerId: string, value: boolean): void {
    this.db.prepare("UPDATE players SET supporter_public = ? WHERE id = ?").run(value ? 1 : 0, playerId);
  }

  /** The public support page. */
  info(): SupportInfo {
    if (!this.enabled) return { enabled: false, url: null, monthlyCost: null, supporters: 0, names: [] };
    const active = (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM players p WHERE p.deleted_at IS NULL AND ${SUPPORTER_ACTIVE}`)
        .get() as { n: number }
    ).n;
    const names = (
      this.db
        .prepare(
          `SELECT p.name FROM players p WHERE p.deleted_at IS NULL AND p.banned_at IS NULL
           AND p.supporter_public = 1 AND ${SUPPORTER_ACTIVE} ORDER BY p.supporter_since LIMIT 200`,
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    return {
      enabled: true,
      url: this.config.url || null,
      monthlyCost: this.config.monthlyCost ?? null,
      supporters: active,
      names,
    };
  }

  /** Finds a player by username (case-insensitive) or id. */
  findPlayer(key: string): string | null {
    const row = this.db
      .prepare(
        "SELECT id FROM players WHERE (lower(username) = lower(?1) OR id = ?1) AND deleted_at IS NULL LIMIT 1",
      )
      .get(key) as { id: string } | undefined;
    return row?.id ?? null;
  }

  /** Everyone who supports or supported, with their grants; and the unredeemed codes. */
  overview(): AdminSupportOverview {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.username, p.supporter_since, p.supporter_until, p.supporter_public,
           ${SUPPORTER_ACTIVE} AS active
         FROM players p WHERE p.supporter_since IS NOT NULL AND p.deleted_at IS NULL
         ORDER BY active DESC, p.supporter_until DESC LIMIT 500`,
      )
      .all() as {
      id: string;
      name: string;
      username: string | null;
      supporter_since: string;
      supporter_until: string;
      supporter_public: number;
      active: number;
    }[];
    const grants = this.db.prepare(
      "SELECT months, source, note, created_at AS at FROM supporter_grants WHERE player_id = ? ORDER BY created_at DESC LIMIT 20",
    );
    const supporters: AdminSupporter[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      since: r.supporter_since,
      until: r.supporter_until,
      active: r.active === 1,
      public: r.supporter_public === 1,
      grants: grants.all(r.id) as AdminSupporter["grants"][number][],
    }));
    const openCodes = this.db
      .prepare(
        "SELECT months, note, created_at AS createdAt FROM supporter_codes WHERE redeemed_by IS NULL ORDER BY created_at DESC LIMIT 200",
      )
      .all() as AdminSupportOverview["openCodes"][number][];
    return { supporters, openCodes };
  }
}
