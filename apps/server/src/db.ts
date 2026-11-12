import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { GameResult, TurnRecord } from "@tavli/engine";
import type {
  AdminReport,
  AnalysisSummary,
  FairnessReveal,
  LeaderboardEntry,
  MatchEndReason,
  MatchSummary,
  MatchVariantId,
  ModerationInfo,
  ModerationSignals,
  ProfileResponse,
  PublicPlayer,
  PublicPlayerRef,
  RatingEntry,
  TimingSummary,
} from "@tavli/protocol";
import { ratingChange, STARTING_RATING } from "./rating";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ratings (
  player_id TEXT NOT NULL REFERENCES players(id),
  variant TEXT NOT NULL,
  rating REAL NOT NULL,
  experience INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, variant)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL,
  length INTEGER NOT NULL,
  p0 TEXT NOT NULL REFERENCES players(id),
  p1 TEXT NOT NULL REFERENCES players(id),
  winner INTEGER NOT NULL,
  score0 INTEGER NOT NULL,
  score1 INTEGER NOT NULL,
  reason TEXT NOT NULL,
  rating_delta0 REAL NOT NULL,
  rating_delta1 REAL NOT NULL,
  games TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_p0 ON matches(p0, ended_at);
CREATE INDEX IF NOT EXISTS matches_p1 ON matches(p1, ended_at);
CREATE INDEX IF NOT EXISTS ratings_board ON ratings(variant, rating);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL,
  last_used TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL REFERENCES players(id),
  reported TEXT NOT NULL REFERENCES players(id),
  match_id TEXT,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_once ON reports(reporter, reported, coalesce(match_id, ''));
CREATE INDEX IF NOT EXISTS reports_open ON reports(resolved_at, created_at);
CREATE TABLE IF NOT EXISTS analyses (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  decisions INTEGER NOT NULL,
  agree INTEGER NOT NULL,
  loss REAL NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS analyses_player ON analyses(player_id, created_at);
CREATE TABLE IF NOT EXISTS timings (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  n INTEGER NOT NULL,
  sum_log REAL NOT NULL,
  sum_log2 REAL NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS timings_player ON timings(player_id, created_at);
CREATE INDEX IF NOT EXISTS matches_ended ON matches(ended_at);
`;

/** Columns added after the first release (applied once, idempotent). */
const MIGRATIONS: readonly [table: string, column: string, ddl: string][] = [
  ["players", "username", "ALTER TABLE players ADD COLUMN username TEXT"],
  ["players", "password_hash", "ALTER TABLE players ADD COLUMN password_hash TEXT"],
  ["players", "email", "ALTER TABLE players ADD COLUMN email TEXT"],
  ["matches", "fairness", "ALTER TABLE matches ADD COLUMN fairness TEXT"],
  ["players", "banned_at", "ALTER TABLE players ADD COLUMN banned_at TEXT"],
  ["players", "ban_reason", "ALTER TABLE players ADD COLUMN ban_reason TEXT"],
  ["players", "last_seen", "ALTER TABLE players ADD COLUMN last_seen TEXT"],
  ["players", "deleted_at", "ALTER TABLE players ADD COLUMN deleted_at TEXT"],
];

/** How many reports one player may file per day. */
export const REPORTS_PER_DAY = 10;

/** Shown instead of the name of a deleted player in old matches and tournaments. */
export const DELETED_NAME = "—";

/**
 * Fair-play signal thresholds. Bot agreement: the medium bot reaches 70–88 % in self-play, the
 * strong bot itself 100 %; 92 % over 150+ decisions is very unusual for a person.
 */
export const SIGNALS = {
  days: 90,
  botLikeDecisions: 150,
  botLikeAgreement: 0.92,
  forfeitMatches: 8,
  forfeitRate: 0.3,
  dumpingMatches: 3,
  dumpingDays: 30,
  /** A game resigned within this many history records counts as an early resignation. */
  earlyResignRecords: 10,
  /**
   * Think times: people spread widely in ln(seconds) (quick obvious moves, long thought on hard
   * ones, typically around 0.7–1.0); a tool relaying moves with a fixed delay hardly varies.
   */
  timingDecisions: 100,
  timingSpread: 0.35,
} as const;

/** Think-time statistics of one player in one match: count, Σ ln(s), Σ ln(s)². */
export interface TimingStats {
  readonly n: number;
  readonly sumLog: number;
  readonly sumLog2: number;
}

export const timingSummary = (n: number, sumLog: number, sumLog2: number): TimingSummary => {
  const mean = sumLog / n;
  return {
    decisions: n,
    typicalSeconds: Math.exp(mean),
    spread: Math.sqrt(Math.max(0, sumLog2 / n - mean * mean)),
  };
};

/** Errors a client may see, with an HTTP status. */
export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** scrypt cost: N=2^15 (32 MiB, ~100 ms); older hashes are upgraded on the next login. */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
/** Hashes run on the libuv thread pool; at most this many at once, the rest queue (or are refused). */
const HASH_CONCURRENCY = 2;
const HASH_QUEUE_MAX = 32;

let hashing = 0;
const hashQueue: (() => void)[] = [];

const scryptAsync = async (
  password: string,
  salt: Buffer,
  keylen: number,
  n: number,
  r: number,
  p: number,
) => {
  if (hashing >= HASH_CONCURRENCY) {
    if (hashQueue.length >= HASH_QUEUE_MAX) throw new AccountError(503, "server busy, try again");
    await new Promise<void>((resolve) => hashQueue.push(resolve));
  }
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, keylen, { N: n, r, p, maxmem: SCRYPT_MAXMEM }, (err, key) =>
        err ? reject(err) : resolve(key),
      ),
    );
  } finally {
    hashing--;
    hashQueue.shift()?.();
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "base64"),
    expected.length,
    Number(n),
    Number(r),
    Number(p),
  );
  return timingSafeEqual(expected, actual);
};

/** Whether a stored hash uses weaker parameters than the current ones. */
const needsRehash = (stored: string): boolean => Number(stored.split("$")[1]) < SCRYPT.N;

/** Dummy hash so failed logins for unknown users cost the same time as wrong passwords. */
let dummyHash: Promise<string> | null = null;
const DUMMY_HASH = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));

/** Login sessions end after this long without use, and in any case after the absolute limit. */
export const SESSION_IDLE_DAYS = 90;
export const SESSION_MAX_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;
/** last_used is written at most this often (fewer writes per request). */
const TOUCH_MS = 60 * 60 * 1000;

/**
 * Data retention (also described in the privacy notice): guests who never finished a match are
 * deleted after GUEST_DAYS without activity, fair-play data after FAIRPLAY_DAYS, resolved
 * reports after REPORT_DAYS.
 */
export const RETENTION = { guestDays: 30, fairPlayDays: 180, reportDays: 365 } as const;

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string | null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export interface PlayerRow {
  readonly id: string;
  readonly name: string;
  /** Set when a moderator banned the player from online play. */
  readonly banned?: boolean;
}

/** A finished game inside a match, kept for replays. */
export interface StoredGame {
  readonly variant: string;
  readonly history: readonly TurnRecord[];
  /** Missing for a game cut short by a forfeit. */
  readonly result?: GameResult | null;
}

export interface FinishedMatch {
  readonly id: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly players: readonly [string, string];
  readonly winner: 0 | 1;
  readonly score: readonly [number, number];
  readonly reason: MatchEndReason;
  readonly games: readonly StoredGame[];
  readonly startedAt: string;
  /** Rated matches change ratings; matches abandoned before the first move are not. */
  readonly rated: boolean;
  /** Seeds and rolls to verify the dice later. */
  readonly fairness?: FairnessReveal;
  /** Think times per seat (fair-play signal). */
  readonly timing?: readonly [TimingStats, TimingStats];
}

/** Persistence on SQLite (node:sqlite): guest players, per-variant FIBS ratings, match archive. */
export class Store {
  /** Also used by the tournament tables (tournaments.ts). */
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    for (const [table, column, ddl] of MIGRATIONS) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) this.db.exec(ddl);
    }
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS players_username ON players(lower(username))");
    // Accounts created before sessions expired kept their guest token: turn it into a session.
    const legacy = this.db
      .prepare("SELECT id FROM players WHERE username IS NOT NULL AND token_hash NOT LIKE '-%'")
      .all() as { id: string }[];
    for (const { id } of legacy) this.guestTokenToSession(id);
  }

  close(): void {
    this.db.close();
  }

  createPlayer(name: string): { id: string; token: string; name: string } {
    const id = randomUUID();
    const token = randomBytes(24).toString("base64url");
    this.db
      .prepare("INSERT INTO players (id, token_hash, name, created_at) VALUES (?, ?, ?, ?)")
      .run(id, hashToken(token).toString("hex"), name, new Date().toISOString());
    return { id, token, name };
  }

  /**
   * Returns the player if the token matches: the guest token (guests only) or a login session
   * that has not expired.
   */
  authenticate(id: string, token: string): PlayerRow | null {
    const row = this.db
      .prepare("SELECT id, name, token_hash, banned_at, deleted_at FROM players WHERE id = ?")
      .get(id) as
      | { id: string; name: string; token_hash: string; banned_at: string | null; deleted_at: string | null }
      | undefined;
    if (!row || row.deleted_at) return null;
    const player: PlayerRow = { id: row.id, name: row.name, banned: row.banned_at !== null };
    const actual = hashToken(token);
    const expected = Buffer.from(row.token_hash, "hex");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      this.touchPlayer(id);
      return player;
    }
    const key = actual.toString("hex");
    const session = this.db
      .prepare("SELECT player_id, created_at, last_used FROM sessions WHERE token_hash = ?")
      .get(key) as { player_id: string; created_at: string; last_used: string } | undefined;
    if (session?.player_id !== id) return null;
    const now = Date.now();
    if (
      now - Date.parse(session.last_used) > SESSION_IDLE_DAYS * DAY ||
      now - Date.parse(session.created_at) > SESSION_MAX_DAYS * DAY
    ) {
      this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(key);
      return null;
    }
    if (now - Date.parse(session.last_used) > TOUCH_MS) {
      this.db
        .prepare("UPDATE sessions SET last_used = ? WHERE token_hash = ?")
        .run(new Date(now).toISOString(), key);
      this.touchPlayer(id);
    }
    return player;
  }

  /** Last activity of a player (for the retention of inactive guests); written at most hourly. */
  private touchPlayer(id: string): void {
    const now = Date.now();
    const last = this.lastSeen.get(id) ?? 0;
    if (now - last < TOUCH_MS) return;
    this.lastSeen.set(id, now);
    this.db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(new Date(now).toISOString(), id);
  }

  private readonly lastSeen = new Map<string, number>();

  account(id: string): AccountRow | null {
    const row = this.db.prepare("SELECT id, name, username, email FROM players WHERE id = ?").get(id) as
      | AccountRow
      | undefined;
    return row ?? null;
  }

  /**
   * Turns a guest profile into an account with username and password (ratings stay). The guest
   * token of this device becomes a normal login session, so it can expire and be revoked.
   */
  async claimAccount(
    id: string,
    username: string,
    password: string,
    email: string | null,
  ): Promise<AccountRow> {
    const current = this.account(id);
    if (!current) throw new AccountError(404, "unknown player");
    if (current.username) throw new AccountError(409, "account already exists");
    const taken = this.db.prepare("SELECT 1 FROM players WHERE lower(username) = lower(?)").get(username);
    if (taken) throw new AccountError(409, "username taken");
    const hash = await hashPassword(password);
    // re-check after the await: another request may have taken the name meanwhile
    if (this.db.prepare("SELECT 1 FROM players WHERE lower(username) = lower(?)").get(username))
      throw new AccountError(409, "username taken");
    this.db
      .prepare("UPDATE players SET username = ?, password_hash = ?, email = ? WHERE id = ?")
      .run(username, hash, email, id);
    this.guestTokenToSession(id);
    return this.account(id)!;
  }

  /** Moves the guest token of an account into the sessions table (and disables it as guest token). */
  private guestTokenToSession(id: string): void {
    const row = this.db.prepare("SELECT token_hash FROM players WHERE id = ?").get(id) as
      | { token_hash: string }
      | undefined;
    if (!row || row.token_hash.startsWith("-")) return;
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO sessions (token_hash, player_id, created_at, last_used) VALUES (?, ?, ?, ?)",
      )
      .run(row.token_hash, id, now, now);
    // "-" + random: never equal to a SHA-256 hex digest
    this.db
      .prepare("UPDATE players SET token_hash = ? WHERE id = ?")
      .run(`-${randomBytes(16).toString("hex")}`, id);
  }

  /** Checks credentials and opens a new session (one per device). */
  async login(username: string, password: string): Promise<{ id: string; token: string; name: string }> {
    const row = this.db
      .prepare(
        "SELECT id, name, password_hash, banned_at FROM players WHERE lower(username) = lower(?) AND deleted_at IS NULL",
      )
      .get(username) as
      | { id: string; name: string; password_hash: string | null; banned_at: string | null }
      | undefined;
    const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH()));
    if (!row?.password_hash || !ok) throw new AccountError(401, "wrong username or password");
    if (row.banned_at) throw new AccountError(403, "banned");
    if (needsRehash(row.password_hash)) {
      const upgraded = await hashPassword(password);
      this.db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(upgraded, row.id);
    }
    const token = randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (token_hash, player_id, created_at, last_used) VALUES (?, ?, ?, ?)")
      .run(hashToken(token).toString("hex"), row.id, now, now);
    return { id: row.id, token, name: row.name };
  }

  /** Ends a login session. */
  logout(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token).toString("hex"));
  }

  /** Ends all sessions of a player except the one with `keepToken`; returns how many ended. */
  logoutOthers(id: string, keepToken: string): number {
    return Number(
      this.db
        .prepare("DELETE FROM sessions WHERE player_id = ? AND token_hash != ?")
        .run(id, hashToken(keepToken).toString("hex")).changes,
    );
  }

  /** Throws unless the password is the account's. */
  async checkPassword(id: string, password: string): Promise<void> {
    const row = this.db.prepare("SELECT password_hash FROM players WHERE id = ?").get(id) as
      | { password_hash: string | null }
      | undefined;
    if (!row?.password_hash || !(await verifyPassword(password, row.password_hash)))
      throw new AccountError(401, "wrong password");
  }

  /** Changes the password and ends every other session (a stolen token stops working). */
  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
    keepToken: string,
  ): Promise<void> {
    const row = this.db.prepare("SELECT password_hash FROM players WHERE id = ?").get(id) as
      | { password_hash: string | null }
      | undefined;
    if (!row?.password_hash || !(await verifyPassword(oldPassword, row.password_hash))) {
      throw new AccountError(401, "wrong password");
    }
    const hash = await hashPassword(newPassword);
    this.db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(hash, id);
    this.guestTokenToSession(id);
    this.logoutOthers(id, keepToken);
  }

  // ---- privacy: export and deletion ------------------------------------------------------------

  /** Everything stored about a player, as JSON for the data export (GDPR Art. 15/20). */
  exportData(id: string): Record<string, unknown> | null {
    const p = this.db
      .prepare(
        "SELECT id, name, username, email, created_at, last_seen, banned_at, ban_reason FROM players WHERE id = ?",
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!p) return null;
    const all = (sql: string) => this.db.prepare(sql).all(id) as Record<string, unknown>[];
    const matches = all(
      `SELECT id, variant, length, p0, p1, winner, score0, score1, reason, rating_delta0, rating_delta1,
         started_at, ended_at, games FROM matches WHERE p0 = ?1 OR p1 = ?1 ORDER BY ended_at`,
    ).map((m) => ({ ...m, games: JSON.parse(String(m.games)) }));
    return {
      exportedAt: new Date().toISOString(),
      player: p,
      sessions: all("SELECT created_at, last_used FROM sessions WHERE player_id = ?"),
      ratings: all("SELECT variant, rating, experience, matches, wins FROM ratings WHERE player_id = ?"),
      matches,
      reportsFiled: all(
        "SELECT reported, match_id, reason, note, created_at FROM reports WHERE reporter = ?",
      ),
      fairPlayAnalyses: all(
        "SELECT match_id, decisions, agree, loss, created_at FROM analyses WHERE player_id = ?",
      ),
      thinkTimes: all("SELECT match_id, n, sum_log, sum_log2, created_at FROM timings WHERE player_id = ?"),
      tournaments: this.tableExists("tournament_entries")
        ? all("SELECT tournament_id, seed, withdrawn, joined_at FROM tournament_entries WHERE player_id = ?")
        : [],
      pushSubscriptions: this.tableExists("push_subscriptions")
        ? all("SELECT created_at, lang FROM push_subscriptions WHERE player_id = ?")
        : [],
    };
  }

  /**
   * Deletes a player: login data, e-mail, sessions, ratings, push subscriptions, fair-play data
   * and own reports are removed; the name is replaced, so archived matches of the opponents stay
   * readable without personal data. Returns false for an unknown player.
   */
  deletePlayer(id: string): boolean {
    const exists = this.db.prepare("SELECT 1 FROM players WHERE id = ? AND deleted_at IS NULL").get(id);
    if (!exists) return false;
    const run = (sql: string) => this.db.prepare(sql).run(id);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE players SET name = ?, username = NULL, password_hash = NULL, email = NULL, token_hash = ?,
             deleted_at = ? WHERE id = ?`,
        )
        .run(DELETED_NAME, `-${randomBytes(16).toString("hex")}`, new Date().toISOString(), id);
      run("DELETE FROM sessions WHERE player_id = ?");
      run("DELETE FROM ratings WHERE player_id = ?");
      run("DELETE FROM analyses WHERE player_id = ?");
      run("DELETE FROM timings WHERE player_id = ?");
      run("DELETE FROM reports WHERE reporter = ?1 OR reported = ?1");
      if (this.tableExists("push_subscriptions")) run("DELETE FROM push_subscriptions WHERE player_id = ?");
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return true;
  }

  private tableExists(name: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  }

  /**
   * Applies the retention periods (RETENTION); returns what was removed. Guests without any
   * finished match or tournament entry are deleted completely after a period without activity.
   */
  prune(now = Date.now()): { guests: number; fairPlay: number; reports: number } {
    const before = (days: number) => new Date(now - days * DAY).toISOString();
    const guests = this.db
      .prepare(
        `SELECT id FROM players p WHERE username IS NULL AND coalesce(last_seen, created_at) < ?
           AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.p0 = p.id OR m.p1 = p.id)
           AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.reporter = p.id OR r.reported = p.id)
           ${this.tableExists("tournament_entries") ? "AND NOT EXISTS (SELECT 1 FROM tournament_entries e WHERE e.player_id = p.id) AND NOT EXISTS (SELECT 1 FROM tournaments t WHERE t.created_by = p.id)" : ""}`,
      )
      .all(before(RETENTION.guestDays)) as { id: string }[];
    this.db.exec("BEGIN");
    try {
      for (const { id } of guests) {
        for (const table of ["sessions", "ratings", "analyses", "timings"])
          this.db.prepare(`DELETE FROM ${table} WHERE player_id = ?`).run(id);
        if (this.tableExists("push_subscriptions"))
          this.db.prepare("DELETE FROM push_subscriptions WHERE player_id = ?").run(id);
        this.db.prepare("DELETE FROM players WHERE id = ?").run(id);
      }
      const old = before(RETENTION.fairPlayDays);
      const fairPlay =
        Number(this.db.prepare("DELETE FROM analyses WHERE created_at < ?").run(old).changes) +
        Number(this.db.prepare("DELETE FROM timings WHERE created_at < ?").run(old).changes);
      const reports = Number(
        this.db
          .prepare("DELETE FROM reports WHERE resolved_at IS NOT NULL AND resolved_at < ?")
          .run(before(RETENTION.reportDays)).changes,
      );
      this.db.exec("COMMIT");
      return { guests: guests.length, fairPlay, reports };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Consistent copy of the database (also while it is in use), e.g. for backups. */
  backup(path: string): void {
    this.db.prepare("VACUUM INTO ?").run(path);
  }

  /** Cheap check that the database answers (health endpoint). */
  healthy(): boolean {
    try {
      return !!this.db.prepare("SELECT 1 AS ok").get();
    } catch {
      return false;
    }
  }

  /** Finished matches of a player. */
  matchCount(id: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM matches WHERE p0 = ?1 OR p1 = ?1").get(id) as { n: number }
    ).n;
  }

  rename(id: string, name: string): void {
    this.db.prepare("UPDATE players SET name = ? WHERE id = ?").run(name, id);
  }

  getPlayer(id: string): PlayerRow | null {
    const row = this.db.prepare("SELECT id, name FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
    return row ?? null;
  }

  rating(playerId: string, variant: MatchVariantId): RatingEntry & { experience: number } {
    const row = this.db
      .prepare("SELECT rating, experience, matches, wins FROM ratings WHERE player_id = ? AND variant = ?")
      .get(playerId, variant) as
      | { rating: number; experience: number; matches: number; wins: number }
      | undefined;
    return { variant, rating: STARTING_RATING, experience: 0, matches: 0, wins: 0, ...row };
  }

  publicPlayer(playerId: string, variant: MatchVariantId): PublicPlayer {
    const p = this.getPlayer(playerId);
    return { id: playerId, name: p?.name ?? "?", rating: Math.round(this.rating(playerId, variant).rating) };
  }

  /** Sets a rating directly (administration and tests). */
  setRating(playerId: string, variant: MatchVariantId, rating: number): void {
    this.db
      .prepare(
        `INSERT INTO ratings (player_id, variant, rating, experience, matches, wins) VALUES (?, ?, ?, 0, 0, 0)
         ON CONFLICT(player_id, variant) DO UPDATE SET rating = excluded.rating`,
      )
      .run(playerId, variant, rating);
  }

  /** Stores a finished match and updates both ratings atomically. Returns the rating deltas per seat. */
  saveMatch(m: FinishedMatch): [number, number] {
    const loser = m.winner === 0 ? 1 : 0;
    const r = [this.rating(m.players[0], m.variant), this.rating(m.players[1], m.variant)] as const;
    const deltas: [number, number] = [0, 0];
    if (m.rated) {
      const [win, lose] = ratingChange(r[m.winner], r[loser], m.length);
      deltas[m.winner] = win;
      deltas[loser] = lose;
    }
    const upsert = this.db.prepare(`
      INSERT INTO ratings (player_id, variant, rating, experience, matches, wins) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(player_id, variant) DO UPDATE SET
        rating = excluded.rating, experience = excluded.experience,
        matches = ratings.matches + 1, wins = ratings.wins + excluded.wins`);
    this.db.exec("BEGIN");
    try {
      if (m.rated) {
        for (const seat of [0, 1] as const) {
          upsert.run(
            m.players[seat],
            m.variant,
            r[seat].rating + deltas[seat],
            r[seat].experience + m.length,
            seat === m.winner ? 1 : 0,
          );
        }
      }
      this.db
        .prepare(
          `INSERT INTO matches (id, variant, length, p0, p1, winner, score0, score1, reason,
            rating_delta0, rating_delta1, games, started_at, ended_at, fairness)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          m.id,
          m.variant,
          m.length,
          m.players[0],
          m.players[1],
          m.winner,
          m.score[0],
          m.score[1],
          m.reason,
          deltas[0],
          deltas[1],
          JSON.stringify(m.games),
          m.startedAt,
          new Date().toISOString(),
          m.fairness ? JSON.stringify(m.fairness) : null,
        );
      const now = new Date().toISOString();
      for (const seat of [0, 1] as const) {
        const tm = m.timing?.[seat];
        if (!tm || tm.n === 0) continue;
        this.db
          .prepare(
            "INSERT OR REPLACE INTO timings (match_id, player_id, n, sum_log, sum_log2, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(m.id, m.players[seat], tm.n, tm.sumLog, tm.sumLog2, now);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return deltas;
  }

  /** Rated matches between two players since a point in time (anti-farming limit). */
  ratedMatchesBetween(a: string, b: string, sinceIso: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM matches
         WHERE ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))
           AND ended_at >= ? AND (rating_delta0 != 0 OR rating_delta1 != 0)`,
      )
      .get(a, b, b, a, sinceIso) as { n: number };
    return row.n;
  }

  leaderboard(variant: MatchVariantId, limit = 50): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.name, r.rating, r.matches, r.wins FROM ratings r
         JOIN players p ON p.id = r.player_id
         WHERE r.variant = ? AND r.matches > 0 AND p.banned_at IS NULL ORDER BY r.rating DESC LIMIT ?`,
      )
      .all(variant, limit) as {
      player_id: string;
      name: string;
      rating: number;
      matches: number;
      wins: number;
    }[];
    return rows.map((r) => ({
      playerId: r.player_id,
      name: r.name,
      variant,
      rating: Math.round(r.rating),
      matches: r.matches,
      wins: r.wins,
    }));
  }

  profile(playerId: string): ProfileResponse | null {
    const p = this.getPlayer(playerId);
    if (!p) return null;
    const ratings = (
      this.db
        .prepare("SELECT variant, rating, matches, wins FROM ratings WHERE player_id = ? ORDER BY variant")
        .all(playerId) as { variant: MatchVariantId; rating: number; matches: number; wins: number }[]
    ).map((r) => ({ ...r, rating: Math.round(r.rating) }));
    const recent = this.db
      .prepare(`SELECT id FROM matches WHERE p0 = ? OR p1 = ? ORDER BY ended_at DESC LIMIT 20`)
      .all(playerId, playerId) as { id: string }[];
    return {
      id: p.id,
      name: p.name,
      ratings,
      recent: recent.map((r) => this.matchSummary(r.id)).filter((x): x is MatchSummary => x !== null),
    };
  }

  matchSummary(id: string): MatchSummary | null {
    const m = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as
      | {
          id: string;
          variant: MatchVariantId;
          length: number;
          p0: string;
          p1: string;
          winner: 0 | 1;
          score0: number;
          score1: number;
          reason: MatchEndReason;
          ended_at: string;
        }
      | undefined;
    if (!m) return null;
    const name = (id: string) => this.getPlayer(id)?.name ?? "?";
    return {
      id: m.id,
      variant: m.variant,
      length: m.length,
      players: [
        { id: m.p0, name: name(m.p0), rating: Math.round(this.rating(m.p0, m.variant).rating) },
        { id: m.p1, name: name(m.p1), rating: Math.round(this.rating(m.p1, m.variant).rating) },
      ],
      winner: m.winner,
      score: [m.score0, m.score1],
      reason: m.reason,
      endedAt: m.ended_at,
    };
  }

  matchFairness(id: string): FairnessReveal | null {
    const row = this.db.prepare("SELECT fairness FROM matches WHERE id = ?").get(id) as
      | { fairness: string | null }
      | undefined;
    return row?.fairness ? (JSON.parse(row.fairness) as FairnessReveal) : null;
  }

  matchGames(id: string): StoredGame[] | null {
    const row = this.db.prepare("SELECT games FROM matches WHERE id = ?").get(id) as
      | { games: string }
      | undefined;
    return row ? (JSON.parse(row.games) as StoredGame[]) : null;
  }

  // ---- moderation ------------------------------------------------------------------------------

  /**
   * Files a report. Returns false if the reporter already reported this player for this match
   * or has reached the daily limit.
   */
  addReport(r: NewReport): boolean {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = this.db
      .prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND created_at >= ?")
      .get(r.reporter, since) as { n: number };
    if (recent.n >= REPORTS_PER_DAY) return false;
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO reports (reporter, reported, match_id, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(r.reporter, r.reported, r.matchId ?? null, r.reason, r.note ?? "", new Date().toISOString());
    return Number(result.changes) > 0;
  }

  reports(open = true, limit = 100): AdminReport[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.reporter, a.name AS reporter_name, r.reported, b.name AS reported_name,
                b.banned_at, r.match_id, r.reason, r.note, r.created_at, r.resolved_at, r.resolution,
                (SELECT COUNT(*) FROM reports x WHERE x.reported = r.reported) AS total
         FROM reports r JOIN players a ON a.id = r.reporter JOIN players b ON b.id = r.reported
         WHERE (r.resolved_at IS NULL) = ? ORDER BY r.created_at DESC LIMIT ?`,
      )
      .all(open ? 1 : 0, limit) as Record<string, string | number | null>[];
    return rows.map((x) => ({
      id: Number(x.id),
      reporter: { id: String(x.reporter), name: String(x.reporter_name) },
      reported: { id: String(x.reported), name: String(x.reported_name), banned: x.banned_at !== null },
      reportsAgainst: Number(x.total),
      matchId: (x.match_id as string | null) ?? null,
      reason: String(x.reason),
      note: String(x.note ?? ""),
      createdAt: String(x.created_at),
      resolvedAt: (x.resolved_at as string | null) ?? null,
      resolution: (x.resolution as string | null) ?? null,
    }));
  }

  resolveReport(id: number, resolution: string): boolean {
    const result = this.db
      .prepare("UPDATE reports SET resolved_at = ?, resolution = ? WHERE id = ? AND resolved_at IS NULL")
      .run(new Date().toISOString(), resolution, id);
    return Number(result.changes) > 0;
  }

  /** Bans (or unbans with `reason = null`) a player; a ban also ends all login sessions. */
  setBan(playerId: string, reason: string | null): boolean {
    const result = this.db
      .prepare("UPDATE players SET banned_at = ?, ban_reason = ? WHERE id = ?")
      .run(reason === null ? null : new Date().toISOString(), reason, playerId);
    if (reason !== null) this.db.prepare("DELETE FROM sessions WHERE player_id = ?").run(playerId);
    return Number(result.changes) > 0;
  }

  moderationInfo(playerId: string): ModerationInfo | null {
    const row = this.db
      .prepare("SELECT id, name, username, created_at, banned_at, ban_reason FROM players WHERE id = ?")
      .get(playerId) as Record<string, string | null> | undefined;
    if (!row) return null;
    const count = (sql: string) => (this.db.prepare(sql).get(playerId) as { n: number }).n;
    return {
      id: String(row.id),
      name: String(row.name),
      username: row.username ?? null,
      createdAt: String(row.created_at),
      bannedAt: row.banned_at ?? null,
      banReason: row.ban_reason ?? null,
      reportsAgainst: count("SELECT COUNT(*) AS n FROM reports WHERE reported = ?"),
      reportsFiled: count("SELECT COUNT(*) AS n FROM reports WHERE reporter = ?"),
      matches: count("SELECT COUNT(*) AS n FROM matches WHERE p0 = ?1 OR p1 = ?1"),
      forfeits: count(
        "SELECT COUNT(*) AS n FROM matches WHERE reason != 'won' AND ((p0 = ?1 AND winner = 1) OR (p1 = ?1 AND winner = 0))",
      ),
      analysis: this.analysisSummary(playerId),
      timing: this.timingSummary(playerId),
    };
  }

  /** Think times over the last `SIGNALS.days` days (null without timed decisions). */
  timingSummary(playerId: string): TimingSummary | null {
    const r = this.db
      .prepare(
        "SELECT SUM(n) AS n, SUM(sum_log) AS s, SUM(sum_log2) AS q FROM timings WHERE player_id = ? AND created_at >= ?",
      )
      .get(playerId, this.since(SIGNALS.days)) as { n: number | null; s: number | null; q: number | null };
    return r.n ? timingSummary(r.n, r.s ?? 0, r.q ?? 0) : null;
  }

  // ---- fair-play analysis ------------------------------------------------------------------------

  saveAnalysis(
    matchId: string,
    playerId: string,
    a: { decisions: number; agree: number; loss: number },
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO analyses (match_id, player_id, decisions, agree, loss, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(matchId, playerId, a.decisions, a.agree, a.loss, new Date().toISOString());
  }

  private since(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  /** Agreement with the bot over the last `SIGNALS.days` days (null without analysed decisions). */
  analysisSummary(playerId: string): AnalysisSummary | null {
    const row = this.db
      .prepare(
        "SELECT SUM(decisions) AS d, SUM(agree) AS a, SUM(loss) AS l FROM analyses WHERE player_id = ? AND created_at >= ?",
      )
      .get(playerId, this.since(SIGNALS.days)) as { d: number | null; a: number | null; l: number | null };
    if (!row.d) return null;
    return { decisions: row.d, agreement: (row.a ?? 0) / row.d, averageLoss: (row.l ?? 0) / row.d };
  }

  private playerRef(id: string): PublicPlayerRef {
    const row = this.db.prepare("SELECT name, banned_at FROM players WHERE id = ?").get(id) as
      | { name: string; banned_at: string | null }
      | undefined;
    return { id, name: row?.name ?? "?", banned: !!row?.banned_at };
  }

  /** Fair-play signals for the moderation screen. */
  signals(): ModerationSignals {
    const since = this.since(SIGNALS.days);
    const botLike = (
      this.db
        .prepare(
          `SELECT player_id, SUM(decisions) AS d, SUM(agree) AS a, SUM(loss) AS l FROM analyses
           WHERE created_at >= ? GROUP BY player_id
           HAVING SUM(decisions) >= ? AND 1.0 * SUM(agree) / SUM(decisions) >= ?
           ORDER BY 1.0 * SUM(agree) / SUM(decisions) DESC LIMIT 100`,
        )
        .all(since, SIGNALS.botLikeDecisions, SIGNALS.botLikeAgreement) as {
        player_id: string;
        d: number;
        a: number;
        l: number;
      }[]
    ).map((r) => ({
      player: this.playerRef(r.player_id),
      decisions: r.d,
      agreement: r.a / r.d,
      averageLoss: r.l / r.d,
    }));

    const forfeits = (
      this.db
        .prepare(
          `SELECT pid, COUNT(*) AS n, SUM(lost_cheap) AS f FROM (
             SELECT p0 AS pid, CASE WHEN winner = 1 AND reason != 'won' THEN 1 ELSE 0 END AS lost_cheap FROM matches WHERE ended_at >= ?1
             UNION ALL
             SELECT p1 AS pid, CASE WHEN winner = 0 AND reason != 'won' THEN 1 ELSE 0 END AS lost_cheap FROM matches WHERE ended_at >= ?1
           ) GROUP BY pid HAVING COUNT(*) >= ?2 AND 1.0 * SUM(lost_cheap) / COUNT(*) >= ?3
           ORDER BY 1.0 * SUM(lost_cheap) / COUNT(*) DESC LIMIT 100`,
        )
        .all(since, SIGNALS.forfeitMatches, SIGNALS.forfeitRate) as { pid: string; n: number; f: number }[]
    ).map((r) => ({ player: this.playerRef(r.pid), matches: r.n, forfeits: r.f }));

    // Cheap losses in rated matches: forfeit/abandon, or a game resigned right at the start.
    const rows = this.db
      .prepare(
        `SELECT p0, p1, winner, reason, games FROM matches
         WHERE ended_at >= ? AND (rating_delta0 != 0 OR rating_delta1 != 0)`,
      )
      .all(this.since(SIGNALS.dumpingDays)) as {
      p0: string;
      p1: string;
      winner: number;
      reason: string;
      games: string;
    }[];
    const pairs = new Map<string, number>();
    for (const r of rows) {
      const loserSeat = r.winner === 0 ? 1 : 0;
      let cheap = r.reason !== "won";
      if (!cheap) {
        const games = JSON.parse(r.games) as StoredGame[];
        cheap = games.some(
          (g) =>
            g.history.length <= SIGNALS.earlyResignRecords &&
            g.history.some((h) => h.kind === "resign" && h.player === loserSeat),
        );
      }
      if (!cheap) continue;
      const key = `${loserSeat === 0 ? r.p0 : r.p1}|${loserSeat === 0 ? r.p1 : r.p0}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    const dumping = [...pairs]
      .filter(([, n]) => n >= SIGNALS.dumpingMatches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([key, n]) => {
        const [loser, winner] = key.split("|") as [string, string];
        return { loser: this.playerRef(loser), winner: this.playerRef(winner), matches: n };
      });

    const steadyTiming = (
      this.db
        .prepare(
          `SELECT player_id, SUM(n) AS n, SUM(sum_log) AS s, SUM(sum_log2) AS q FROM timings
           WHERE created_at >= ? GROUP BY player_id HAVING SUM(n) >= ?`,
        )
        .all(since, SIGNALS.timingDecisions) as { player_id: string; n: number; s: number; q: number }[]
    )
      .map((r) => ({ player: r.player_id, ...timingSummary(r.n, r.s, r.q) }))
      .filter((r) => r.spread <= SIGNALS.timingSpread)
      .sort((a, b) => a.spread - b.spread)
      .slice(0, 100)
      .map(({ player, ...rest }) => ({ player: this.playerRef(player), ...rest }));

    return {
      botLike,
      forfeits,
      dumping,
      steadyTiming,
      thresholds: {
        timingDecisions: SIGNALS.timingDecisions,
        timingSpread: SIGNALS.timingSpread,
        botLikeDecisions: SIGNALS.botLikeDecisions,
        botLikeAgreement: SIGNALS.botLikeAgreement,
        forfeitMatches: SIGNALS.forfeitMatches,
        forfeitRate: SIGNALS.forfeitRate,
        dumpingMatches: SIGNALS.dumpingMatches,
        days: SIGNALS.days,
      },
    };
  }
}

export interface NewReport {
  readonly reporter: string;
  readonly reported: string;
  readonly matchId?: string | null;
  readonly reason: string;
  readonly note?: string;
}

export type { AdminReport as ReportRow, ModerationInfo } from "@tavli/protocol";
