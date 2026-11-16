import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { GameResult, TurnRecord } from "@tavli/engine";
import type {
  AccuracyReport,
  ActiveBoard,
  ActiveEntry,
  AdminReport,
  AnalysisSummary,
  FairnessReveal,
  LeaderboardEntry,
  MatchEndReason,
  MatchSummary,
  MatchVariantId,
  ModerationInfo,
  ModerationSignals,
  MonthBoard,
  MonthEntry,
  PeriodCounts,
  PlayerStats,
  ProfileResponse,
  PublicPlayer,
  PublicPlayerRef,
  RatingEntry,
  RatingPoint,
  TimingSummary,
  Trophy,
} from "@tavli/protocol";
import {
  CAREER_VARIANTS,
  type Career,
  type CareerVariant,
  clubPoints,
  clubRank,
  EMPTY_CAREER,
  FRAMES,
  type Frame,
  MAX_FRIENDS,
  mergeCareer,
  OTP_REQUIRED,
  OTP_WRONG,
  type Progress,
  type RatingPool,
  ratingKey,
  SHOWCASE_MAX,
  type SupporterStatus,
} from "@tavli/protocol";
import { ratingChange, STARTING_RATING } from "./rating";
import {
  hashRecoveryCode,
  inviteCode,
  looksLikeRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp";

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
CREATE TABLE IF NOT EXISTS friends (
  requester TEXT NOT NULL REFERENCES players(id),
  addressee TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (requester, addressee)
);
CREATE INDEX IF NOT EXISTS friends_addressee ON friends(addressee);
CREATE TABLE IF NOT EXISTS player_progress (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS friend_invites (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES players(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS month_winners (
  month TEXT NOT NULL,
  variant TEXT NOT NULL,
  place INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  gain REAL NOT NULL,
  matches INTEGER NOT NULL,
  PRIMARY KEY (month, variant, place)
);
CREATE INDEX IF NOT EXISTS month_winners_player ON month_winners(player_id);
CREATE TABLE IF NOT EXISTS month_archive (
  month TEXT PRIMARY KEY,
  archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_codes (
  player_id TEXT NOT NULL REFERENCES players(id),
  code_hash TEXT NOT NULL,
  used_at TEXT,
  PRIMARY KEY (player_id, code_hash)
);
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
  ["players", "club_rank", "ALTER TABLE players ADD COLUMN club_rank INTEGER NOT NULL DEFAULT 0"],
  ["players", "frame", "ALTER TABLE players ADD COLUMN frame TEXT"],
  ["players", "totp_secret", "ALTER TABLE players ADD COLUMN totp_secret TEXT"],
  ["players", "supporter_since", "ALTER TABLE players ADD COLUMN supporter_since TEXT"],
  ["players", "supporter_until", "ALTER TABLE players ADD COLUMN supporter_until TEXT"],
  [
    "players",
    "supporter_public",
    "ALTER TABLE players ADD COLUMN supporter_public INTEGER NOT NULL DEFAULT 0",
  ],
  ["players", "totp_on", "ALTER TABLE players ADD COLUMN totp_on INTEGER NOT NULL DEFAULT 0"],
  ["players", "totp_step", "ALTER TABLE players ADD COLUMN totp_step INTEGER NOT NULL DEFAULT -1"],
  ["matches", "pool", "ALTER TABLE matches ADD COLUMN pool TEXT NOT NULL DEFAULT 'normal'"],
  ["players", "listed", "ALTER TABLE players ADD COLUMN listed INTEGER NOT NULL DEFAULT 1"],
  ["players", "showcase", "ALTER TABLE players ADD COLUMN showcase TEXT"],
  [
    "players",
    "friends_can_watch",
    "ALTER TABLE players ADD COLUMN friends_can_watch INTEGER NOT NULL DEFAULT 1",
  ],
];

/**
 * Monthly and activity rankings: rated matches needed in a month; the activity window and how
 * many matches against the same opponent on one day count (no farming with a friend).
 */
export const BOARDS = { monthMinMatches: 10, activeDays: 30, perOpponentDay: 3, activeMin: 3 } as const;

/** YYYY-MM of a time (UTC). */
export const monthOf = (t: number | Date = Date.now()): string => new Date(t).toISOString().slice(0, 7);
/** Start of a month and of the next one, as ISO strings. */
const monthRange = (month: string): [string, string] => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()];
};
const previousMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

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
  readonly friendsCanWatch: boolean;
  readonly frame: Frame | null;
  readonly listed: boolean;
  readonly showcase: readonly string[];
  readonly twoFactor: boolean;
  readonly recoveryCodesLeft: number;
  readonly supporter: SupporterStatus | null;
}

/** Achievements for online feats: granted and checked by the server from its own records. */
export const SERVER_ACHIEVEMENTS: readonly string[] = [
  "online-win",
  "rating-1600",
  "tournament-win",
  "league-win",
  "corr-ten",
  "league-player",
  "month-winner",
];

/** SQL: whether the player row `p` supports the project right now (dates are ISO strings). */
export const SUPPORTER_ACTIVE =
  "(p.supporter_until IS NOT NULL AND p.supporter_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

/** Name of the app in authenticator apps. */
const TOTP_ISSUER = "Tavli";

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
  /** Which rating the match counts for (default normal). */
  readonly pool?: RatingPool;
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
    const row = this.db
      .prepare(
        `SELECT id, name, username, email, friends_can_watch, listed, showcase, ${this.frameSql} AS frame, totp_on, supporter_since, supporter_until, supporter_public FROM players p WHERE id = ?`,
      )
      .get(id) as
      | (Pick<AccountRow, "id" | "name" | "username" | "email"> & {
          friends_can_watch: number;
          listed: number;
          showcase: string | null;
          frame: string | null;
          totp_on: number;
          supporter_since: string | null;
          supporter_until: string | null;
          supporter_public: number;
        })
      | undefined;
    if (!row) return null;
    const {
      friends_can_watch,
      listed,
      showcase,
      frame,
      totp_on,
      supporter_since,
      supporter_until,
      supporter_public,
      ...rest
    } = row;
    return {
      ...rest,
      friendsCanWatch: friends_can_watch !== 0,
      listed: listed !== 0,
      showcase: this.parseShowcase(showcase),
      frame: (frame as Frame | null) ?? null,
      twoFactor: totp_on === 1,
      recoveryCodesLeft: this.recoveryCodesLeft(id),
      supporter:
        this.supportEnabled && supporter_since && supporter_until
          ? {
              since: supporter_since,
              until: supporter_until,
              active: supporter_until > new Date().toISOString(),
              public: supporter_public === 1,
            }
          : null,
    };
  }

  /** Whether friends may watch this player's private matches. */
  friendsCanWatch(id: string): boolean {
    const row = this.db.prepare("SELECT friends_can_watch FROM players WHERE id = ?").get(id) as
      | { friends_can_watch: number }
      | undefined;
    return row?.friends_can_watch !== 0;
  }

  /** Whether the player appears in the monthly and activity rankings. */
  setListed(id: string, listed: boolean): void {
    this.db.prepare("UPDATE players SET listed = ? WHERE id = ?").run(listed ? 1 : 0, id);
  }

  private parseShowcase(raw: string | null): string[] {
    try {
      const ids = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(ids)
        ? ids.filter((x): x is string => typeof x === "string").slice(0, SHOWCASE_MAX)
        : [];
    } catch {
      return [];
    }
  }

  /** Pins up to SHOWCASE_MAX unlocked achievements to the public profile; false if one is locked. */
  setShowcase(id: string, ids: readonly string[]): boolean {
    const unique = [...new Set(ids)].slice(0, SHOWCASE_MAX);
    const unlocked = this.progress(id).unlocked;
    const verified = this.verifiedAchievements(id);
    if (!unique.every((a) => unlocked[a] || verified.includes(a))) return false;
    this.db.prepare("UPDATE players SET showcase = ? WHERE id = ?").run(JSON.stringify(unique), id);
    return true;
  }

  setFriendsCanWatch(id: string, allowed: boolean): void {
    this.db.prepare("UPDATE players SET friends_can_watch = ? WHERE id = ?").run(allowed ? 1 : 0, id);
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
  ): Promise<AccountRow & { recoveryCodes: string[] }> {
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
    const recoveryCodes = this.newRecoveryCodes(id);
    return { ...this.account(id)!, recoveryCodes };
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

  /**
   * Checks credentials and opens a new session (one per device). With two-factor login the
   * second factor is an app code or an unused recovery code; without it the error says
   * OTP_REQUIRED, so the client can ask for it.
   */
  async login(
    username: string,
    password: string,
    otp?: string,
    now = Date.now(),
  ): Promise<{ id: string; token: string; name: string }> {
    const row = this.db
      .prepare(
        "SELECT id, name, password_hash, banned_at, totp_on FROM players WHERE lower(username) = lower(?) AND deleted_at IS NULL",
      )
      .get(username) as
      | { id: string; name: string; password_hash: string | null; banned_at: string | null; totp_on: number }
      | undefined;
    const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH()));
    if (!row?.password_hash || !ok) throw new AccountError(401, "wrong username or password");
    if (row.banned_at) throw new AccountError(403, "banned");
    if (row.totp_on) {
      if (!otp) throw new AccountError(401, OTP_REQUIRED);
      if (!this.secondFactor(row.id, otp, now)) throw new AccountError(401, OTP_WRONG);
    }
    if (needsRehash(row.password_hash)) {
      const upgraded = await hashPassword(password);
      this.db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(upgraded, row.id);
    }
    return { id: row.id, token: this.openSession(row.id), name: row.name };
  }

  private openSession(playerId: string): string {
    const token = randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (token_hash, player_id, created_at, last_used) VALUES (?, ?, ?, ?)")
      .run(hashToken(token).toString("hex"), playerId, now, now);
    return token;
  }

  // ---- two-factor login and recovery codes ---------------------------------------------------

  private recoveryCodesLeft(id: string): number {
    return (
      this.db
        .prepare("SELECT count(*) AS n FROM recovery_codes WHERE player_id = ? AND used_at IS NULL")
        .get(id) as { n: number }
    ).n;
  }

  /** Replaces all recovery codes of an account; returns the new ones (shown once). */
  newRecoveryCodes(id: string): string[] {
    const codes = newRecoveryCodes();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM recovery_codes WHERE player_id = ?").run(id);
      const insert = this.db.prepare("INSERT INTO recovery_codes (player_id, code_hash) VALUES (?, ?)");
      for (const c of codes) insert.run(id, hashRecoveryCode(c));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return codes;
  }

  /** New recovery codes after confirming the password. */
  async renewRecoveryCodes(id: string, password: string): Promise<string[]> {
    await this.checkPassword(id, password);
    return this.newRecoveryCodes(id);
  }

  /** Uses up a recovery code; false if it is unknown or used. */
  private useRecoveryCode(id: string, code: string): boolean {
    return (
      this.db
        .prepare(
          "UPDATE recovery_codes SET used_at = ? WHERE player_id = ? AND code_hash = ? AND used_at IS NULL",
        )
        .run(new Date().toISOString(), id, hashRecoveryCode(code)).changes === 1
    );
  }

  /** An app code (each time step only once) or, if it looks like one, a recovery code. */
  private secondFactor(id: string, code: string, now: number): boolean {
    if (looksLikeRecoveryCode(code)) return this.useRecoveryCode(id, code);
    return this.appCode(id, code, now);
  }

  private appCode(id: string, code: string, now: number): boolean {
    const row = this.db.prepare("SELECT totp_secret, totp_step FROM players WHERE id = ?").get(id) as
      | { totp_secret: string | null; totp_step: number }
      | undefined;
    if (!row?.totp_secret) return false;
    const step = verifyTotp(row.totp_secret, code, now, row.totp_step);
    if (step === null) return false;
    this.db.prepare("UPDATE players SET totp_step = ? WHERE id = ?").run(step, id);
    return true;
  }

  /** Starts two-factor setup: a new secret, active only after `enableTwoFactor` with a code. */
  async setupTwoFactor(id: string, password: string): Promise<{ secret: string; uri: string }> {
    await this.checkPassword(id, password);
    const acc = this.account(id);
    if (!acc?.username) throw new AccountError(400, "account required");
    if (acc.twoFactor) throw new AccountError(409, "2fa already on");
    const secret = newTotpSecret();
    this.db
      .prepare("UPDATE players SET totp_secret = ?, totp_on = 0, totp_step = -1 WHERE id = ?")
      .run(secret, id);
    return { secret, uri: otpauthUri(TOTP_ISSUER, acc.username, secret) };
  }

  /** Turns two-factor login on once the app shows a matching code. */
  enableTwoFactor(id: string, code: string, now = Date.now()): AccountRow {
    const acc = this.account(id);
    if (!acc?.username) throw new AccountError(400, "account required");
    if (acc.twoFactor) throw new AccountError(409, "2fa already on");
    if (!this.appCode(id, code, now)) throw new AccountError(401, OTP_WRONG);
    this.db.prepare("UPDATE players SET totp_on = 1 WHERE id = ?").run(id);
    return this.account(id)!;
  }

  /** Turns two-factor login off (password and an app or recovery code). */
  async disableTwoFactor(id: string, password: string, code: string, now = Date.now()): Promise<AccountRow> {
    await this.checkPassword(id, password);
    if (!this.account(id)?.twoFactor) throw new AccountError(409, "2fa is off");
    if (!this.secondFactor(id, code, now)) throw new AccountError(401, OTP_WRONG);
    this.db
      .prepare("UPDATE players SET totp_secret = NULL, totp_on = 0, totp_step = -1 WHERE id = ?")
      .run(id);
    return this.account(id)!;
  }

  /**
   * Forgotten password: a recovery code (plus an app code with two-factor login) sets a new
   * password. All sessions end; a new one is opened for this device.
   */
  async recoverAccount(
    username: string,
    code: string,
    password: string,
    otp?: string,
    now = Date.now(),
  ): Promise<{ id: string; token: string; name: string }> {
    const row = this.db
      .prepare(
        "SELECT id, name, banned_at, totp_on FROM players WHERE lower(username) = lower(?) AND deleted_at IS NULL AND password_hash IS NOT NULL",
      )
      .get(username) as { id: string; name: string; banned_at: string | null; totp_on: number } | undefined;
    const fail = new AccountError(401, "wrong username or recovery code");
    if (!row) throw fail;
    if (row.totp_on) {
      if (!otp) throw new AccountError(401, OTP_REQUIRED);
      // the app code first, so a wrong one does not use up the recovery code
      if (!this.appCode(row.id, otp, now)) throw new AccountError(401, OTP_WRONG);
    }
    if (!this.useRecoveryCode(row.id, code)) throw fail;
    if (row.banned_at) throw new AccountError(403, "banned");
    const hash = await hashPassword(password);
    this.db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(hash, row.id);
    this.db.prepare("DELETE FROM sessions WHERE player_id = ?").run(row.id);
    return { id: row.id, token: this.openSession(row.id), name: row.name };
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
      // the secret itself stays on the server: an export must not work as a second factor
      twoFactor: this.account(id)?.twoFactor ?? false,
      recoveryCodes: all("SELECT used_at FROM recovery_codes WHERE player_id = ?"),
      supporter: this.account(id)?.supporter ?? null,
      supporterGrants: this.tableExists("supporter_grants")
        ? all("SELECT months, source, created_at FROM supporter_grants WHERE player_id = ?")
        : [],
      ratings: all("SELECT variant, rating, experience, matches, wins FROM ratings WHERE player_id = ?"),
      rankings: {
        listed: this.account(id)?.listed ?? true,
        showcase: this.account(id)?.showcase ?? [],
        trophies: all("SELECT month, variant, place, gain, matches FROM month_winners WHERE player_id = ?"),
      },
      matches,
      reportsFiled: all(
        "SELECT reported, match_id, reason, note, created_at FROM reports WHERE reporter = ?",
      ),
      friends: this.friendsOf(id),
      fairPlayAnalyses: all(
        "SELECT match_id, decisions, agree, loss, created_at FROM analyses WHERE player_id = ?",
      ),
      thinkTimes: all("SELECT match_id, n, sum_log, sum_log2, created_at FROM timings WHERE player_id = ?"),
      tournaments: this.tableExists("tournament_entries")
        ? all("SELECT tournament_id, seed, withdrawn, joined_at FROM tournament_entries WHERE player_id = ?")
        : [],
      pushPreferences: this.tableExists("push_prefs")
        ? all("SELECT off FROM push_prefs WHERE player_id = ?")
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
      run("DELETE FROM friends WHERE requester = ?1 OR addressee = ?1");
      run("DELETE FROM player_progress WHERE player_id = ?");
      run("DELETE FROM recovery_codes WHERE player_id = ?");
      run("DELETE FROM friend_invites WHERE player_id = ?");
      run("UPDATE players SET totp_secret = NULL, totp_on = 0 WHERE id = ?");
      // supporter status ends with the profile; the grants stay without the person (bookkeeping)
      run(
        "UPDATE players SET supporter_since = NULL, supporter_until = NULL, supporter_public = 0 WHERE id = ?",
      );
      if (this.tableExists("supporter_grants"))
        run("UPDATE supporter_grants SET note = '' WHERE player_id = ?");
      run("UPDATE players SET frame = NULL, club_rank = 0, showcase = NULL WHERE id = ?");
      run("DELETE FROM month_winners WHERE player_id = ?");
      if (this.tableExists("push_subscriptions")) run("DELETE FROM push_subscriptions WHERE player_id = ?");
      if (this.tableExists("push_prefs")) run("DELETE FROM push_prefs WHERE player_id = ?");
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return true;
  }

  tableExists(name: string): boolean {
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
           ${this.tableExists("tournament_entries") ? "AND NOT EXISTS (SELECT 1 FROM tournament_entries e WHERE e.player_id = p.id) AND NOT EXISTS (SELECT 1 FROM tournaments t WHERE t.created_by = p.id)" : ""}
           ${this.tableExists("corr_games") ? "AND NOT EXISTS (SELECT 1 FROM corr_games c WHERE c.p0 = p.id OR c.p1 = p.id)" : ""}
           ${this.tableExists("corr_seeks") ? "AND NOT EXISTS (SELECT 1 FROM corr_seeks k WHERE k.player_id = p.id)" : ""}
           ${this.tableExists("clubs") ? "AND NOT EXISTS (SELECT 1 FROM clubs c2 WHERE c2.created_by = p.id) AND NOT EXISTS (SELECT 1 FROM club_members cm WHERE cm.player_id = p.id) AND NOT EXISTS (SELECT 1 FROM league_entries le WHERE le.player_id = p.id)" : ""}`,
      )
      .all(before(RETENTION.guestDays)) as { id: string }[];
    this.db.exec("BEGIN");
    try {
      for (const { id } of guests) {
        for (const table of ["sessions", "ratings", "analyses", "timings"])
          this.db.prepare(`DELETE FROM ${table} WHERE player_id = ?`).run(id);
        this.db.prepare("DELETE FROM friends WHERE requester = ?1 OR addressee = ?1").run(id);
        this.db.prepare("DELETE FROM player_progress WHERE player_id = ?").run(id);
        if (this.tableExists("push_subscriptions"))
          this.db.prepare("DELETE FROM push_subscriptions WHERE player_id = ?").run(id);
        if (this.tableExists("push_prefs"))
          this.db.prepare("DELETE FROM push_prefs WHERE player_id = ?").run(id);
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

  // ---- friends ---------------------------------------------------------------------------------

  /**
   * Sends a friend request, or accepts the other player's pending one. Returns what happened;
   * throws for unknown players, yourself or a full list.
   */
  befriend(me: string, other: string): "requested" | "accepted" | "already" {
    if (me === other) throw new AccountError(400, "cannot befriend yourself");
    const target = this.db.prepare("SELECT 1 FROM players WHERE id = ? AND deleted_at IS NULL").get(other);
    if (!target) throw new AccountError(404, "unknown player");
    const row = this.friendRow(me, other);
    if (row?.status === "accepted") return "already";
    if (row && row.requester === other) {
      this.db
        .prepare("UPDATE friends SET status = 'accepted' WHERE requester = ? AND addressee = ?")
        .run(other, me);
      return "accepted";
    }
    if (row) return "already";
    const count = (id: string) =>
      (
        this.db
          .prepare("SELECT COUNT(*) AS n FROM friends WHERE requester = ?1 OR addressee = ?1")
          .get(id) as {
          n: number;
        }
      ).n;
    if (count(me) >= MAX_FRIENDS || count(other) >= MAX_FRIENDS)
      throw new AccountError(409, "friend list full");
    this.db
      .prepare("INSERT INTO friends (requester, addressee, status, created_at) VALUES (?, ?, 'pending', ?)")
      .run(me, other, new Date().toISOString());
    return "requested";
  }

  // ---- friend invitations --------------------------------------------------------------------

  /** The player's invitation code (created on first use). */
  inviteCode(playerId: string): string {
    const row = this.db.prepare("SELECT code FROM friend_invites WHERE player_id = ?").get(playerId) as
      | { code: string }
      | undefined;
    return row?.code ?? this.renewInviteCode(playerId);
  }

  /** A new code; links with the old one stop working. */
  renewInviteCode(playerId: string): string {
    for (;;) {
      const code = inviteCode();
      try {
        this.db
          .prepare(
            "INSERT INTO friend_invites (code, player_id, created_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET code = excluded.code, created_at = excluded.created_at",
          )
          .run(code, playerId, new Date().toISOString());
        return code;
      } catch {
        // the rare clash with another player's code: draw again
      }
    }
  }

  /** Who invites with this code (not for deleted or banned players). */
  inviter(code: string): { id: string; name: string } | null {
    return (
      (this.db
        .prepare(
          `SELECT p.id, p.name FROM friend_invites i JOIN players p ON p.id = i.player_id
           WHERE i.code = ? AND p.deleted_at IS NULL AND p.banned_at IS NULL`,
        )
        .get(code.toUpperCase()) as { id: string; name: string } | undefined) ?? null
    );
  }

  /** Redeems an invitation: both are friends at once (a pending request either way is accepted). */
  redeemInvite(
    me: string,
    code: string,
  ): { friend: { id: string; name: string }; result: "accepted" | "already" } {
    const friend = this.inviter(code);
    if (!friend) throw new AccountError(404, "invitation not found");
    if (friend.id === me) throw new AccountError(400, "cannot befriend yourself");
    const row = this.friendRow(me, friend.id);
    if (row?.status === "accepted") return { friend, result: "already" };
    if (row) {
      this.db
        .prepare("UPDATE friends SET status = 'accepted' WHERE requester = ? AND addressee = ?")
        .run(row.requester, row.requester === me ? friend.id : me);
      return { friend, result: "accepted" };
    }
    if (this.friendCount(me) >= MAX_FRIENDS || this.friendCount(friend.id) >= MAX_FRIENDS)
      throw new AccountError(409, "friend list full");
    this.db
      .prepare("INSERT INTO friends (requester, addressee, status, created_at) VALUES (?, ?, 'accepted', ?)")
      .run(friend.id, me, new Date().toISOString());
    return { friend, result: "accepted" };
  }

  private friendCount(id: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM friends WHERE requester = ?1 OR addressee = ?1").get(id) as {
        n: number;
      }
    ).n;
  }

  /** Ends a friendship, withdraws a request or declines one. */
  unfriend(me: string, other: string): boolean {
    const r = this.db
      .prepare(
        "DELETE FROM friends WHERE (requester = ?1 AND addressee = ?2) OR (requester = ?2 AND addressee = ?1)",
      )
      .run(me, other);
    return Number(r.changes) > 0;
  }

  areFriends(a: string, b: string): boolean {
    return this.friendRow(a, b)?.status === "accepted";
  }

  private friendRow(a: string, b: string) {
    return this.db
      .prepare(
        "SELECT requester, addressee, status FROM friends WHERE (requester = ?1 AND addressee = ?2) OR (requester = ?2 AND addressee = ?1)",
      )
      .get(a, b) as { requester: string; addressee: string; status: "pending" | "accepted" } | undefined;
  }

  /** Friends and open requests of a player, by name. */
  friendsOf(me: string): {
    id: string;
    name: string;
    frame: Frame | null;
    rank: number;
    supporter?: boolean;
    status: "accepted" | "incoming" | "outgoing";
  }[] {
    const rows = this.db
      .prepare(
        `SELECT f.requester, f.addressee, f.status, p.id, p.name, ${this.frameSql} AS frame, p.club_rank, ${this.supporterSql} AS supporter FROM friends f
         JOIN players p ON p.id = CASE WHEN f.requester = ?1 THEN f.addressee ELSE f.requester END
         WHERE (f.requester = ?1 OR f.addressee = ?1) AND p.deleted_at IS NULL
         ORDER BY lower(p.name)`,
      )
      .all(me) as {
      requester: string;
      status: string;
      id: string;
      name: string;
      frame: Frame | null;
      club_rank: number;
      supporter: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      frame: r.frame,
      rank: r.club_rank,
      ...(r.supporter ? { supporter: true } : {}),
      status: r.status === "accepted" ? "accepted" : r.requester === me ? "outgoing" : "incoming",
    }));
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

  /**
   * A player's rating. The ratings table keys blitz ratings as "<variant>@blitz" (ratingKey) in
   * its variant column, so the normal ratings keep their rows.
   */
  rating(
    playerId: string,
    variant: MatchVariantId,
    pool: RatingPool = "normal",
  ): RatingEntry & { experience: number } {
    const row = this.db
      .prepare("SELECT rating, experience, matches, wins FROM ratings WHERE player_id = ? AND variant = ?")
      .get(playerId, ratingKey(variant, pool)) as
      | { rating: number; experience: number; matches: number; wins: number }
      | undefined;
    return {
      variant,
      ...(pool === "normal" ? {} : { pool }),
      rating: STARTING_RATING,
      experience: 0,
      matches: 0,
      wins: 0,
      ...row,
    };
  }

  publicPlayer(playerId: string, variant: MatchVariantId, pool: RatingPool = "normal"): PublicPlayer {
    const p = this.getPlayer(playerId);
    return {
      id: playerId,
      name: p?.name ?? "?",
      rating: Math.round(this.rating(playerId, variant, pool).rating),
      frame: this.frameOf(playerId),
      rank: this.rankOf(playerId),
      ...(this.isSupporter(playerId) ? { supporter: true } : {}),
    };
  }

  /**
   * Supporting the project is on only when the operator configured it (SUPPORT_URL, set by
   * `Supporters`); otherwise nobody counts as supporter and nothing of it reaches the players.
   */
  supportEnabled = false;

  /** SQL for "row `p` supports the project right now" (always false while support is off). */
  get supporterSql(): string {
    return this.supportEnabled ? SUPPORTER_ACTIVE : "0";
  }

  /** SQL: the frame of player row `p` as others see it (the patron frame only while supporting). */
  get frameSql(): string {
    return `CASE WHEN p.frame = 'patron' AND NOT ${this.supporterSql} THEN NULL ELSE p.frame END`;
  }

  /** Whether a player supports the project right now. */
  isSupporter(playerId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM players p WHERE p.id = ? AND ${this.supporterSql}`).get(playerId);
  }

  private rankOf(playerId: string): number {
    const row = this.db.prepare("SELECT club_rank FROM players WHERE id = ?").get(playerId) as
      | { club_rank: number }
      | undefined;
    return row?.club_rank ?? 0;
  }

  private frameOf(playerId: string): Frame | null {
    const row = this.db
      .prepare(`SELECT ${this.frameSql} AS frame FROM players p WHERE p.id = ?`)
      .get(playerId) as { frame: string | null } | undefined;
    return (row?.frame as Frame | null) ?? null;
  }

  // ---- progress (achievements, tutorial, puzzles) -------------------------------------------

  progress(playerId: string): Progress {
    const row = this.db.prepare("SELECT data FROM player_progress WHERE player_id = ?").get(playerId) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as Progress) : { unlocked: {}, lessons: [], puzzles: {} };
  }

  /**
   * Merges a device's progress into the stored one and returns the result: achievements keep
   * the earliest date, lessons are united, and for puzzles the first answer of a day counts.
   */
  mergeProgress(playerId: string, incoming: Progress): Progress {
    const current = this.progress(playerId);
    const unlocked = { ...incoming.unlocked, ...current.unlocked };
    for (const [id, at] of Object.entries(incoming.unlocked))
      if (current.unlocked[id] && at < current.unlocked[id]!) unlocked[id] = at;
    const puzzles = { ...incoming.puzzles, ...current.puzzles };
    // keep about a year of puzzle days
    const days = Object.keys(puzzles).sort().reverse();
    for (const d of days.slice(400)) delete puzzles[d];
    // what the server saw itself (online games, correspondence, leagues) is the floor
    const verified = this.verifiedCareer(playerId);
    const career = [current.career, incoming.career].reduce<Career>(
      (acc, c) => (c ? mergeCareer(acc, c) : acc),
      verified,
    );
    const now = new Date().toISOString();
    for (const id of this.verifiedAchievements(playerId)) unlocked[id] ??= now;
    const merged: Progress = {
      unlocked,
      lessons: [...new Set([...current.lessons, ...incoming.lessons])].sort((a, b) => a - b),
      puzzles,
      ...(career ? { career } : {}),
    };
    // the club rank shown next to the name follows the activity points
    this.db
      .prepare("UPDATE players SET club_rank = ? WHERE id = ?")
      .run(clubRank(clubPoints(merged)), playerId);
    this.db
      .prepare(
        `INSERT INTO player_progress (player_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(playerId, JSON.stringify(merged), new Date().toISOString());
    return merged;
  }

  /**
   * Chooses an avatar frame. Frames for online feats need the server's own records; the others
   * (tutorial, puzzles, long-term goals) the achievement in the stored progress.
   */
  setFrame(playerId: string, frame: Frame | null): boolean {
    if (frame !== null) {
      const needed: string = FRAMES[frame];
      const ok =
        needed === "supporter"
          ? this.isSupporter(playerId)
          : SERVER_ACHIEVEMENTS.includes(needed)
            ? this.verifiedAchievements(playerId).includes(needed)
            : !!this.progress(playerId).unlocked[needed];
      if (!ok) return false;
    }
    this.db.prepare("UPDATE players SET frame = ? WHERE id = ?").run(frame, playerId);
    return true;
  }

  // ---- progress the server can count itself ----------------------------------------------------

  /**
   * Career counters from the server's own records: games and wins (per variant) of online
   * matches and finished correspondence games, finished correspondence and league games.
   * Merged into the stored career as a floor, so these never depend on what a device reports.
   */
  verifiedCareer(playerId: string): Career {
    const winsBy: Career["winsBy"] = {};
    let games = 0;
    let wins = 0;
    const count = (table: string, where: string) => {
      const rows = this.db
        .prepare(
          `SELECT json_extract(g.value, '$.variant') AS v, COUNT(*) AS n,
             SUM(json_extract(g.value, '$.result.winner') = (CASE WHEN t.p0 = ?1 THEN 0 ELSE 1 END)
               AND json_extract(g.value, '$.result.reason') <> 'mana-draw') AS w
           FROM ${table} t, json_each(t.games) g
           WHERE (t.p0 = ?1 OR t.p1 = ?1) AND ${where} AND json_extract(g.value, '$.result') IS NOT NULL
           GROUP BY v`,
        )
        .all(playerId) as { v: string; n: number; w: number | null }[];
      for (const r of rows) {
        games += r.n;
        wins += r.w ?? 0;
        if ((CAREER_VARIANTS as readonly string[]).includes(r.v) && r.w)
          winsBy[r.v as CareerVariant] = (winsBy[r.v as CareerVariant] ?? 0) + r.w;
      }
    };
    count("matches", "1");
    let corrFinished = 0;
    let leagueGames = 0;
    if (this.tableExists("corr_games")) {
      count("corr_games", "t.status = 'finished'");
      const c = this.db
        .prepare(
          `SELECT COUNT(*) AS n, COUNT(league_id) AS league FROM corr_games
           WHERE (p0 = ?1 OR p1 = ?1) AND status = 'finished' AND winner IS NOT NULL`,
        )
        .get(playerId) as { n: number; league: number };
      corrFinished = c.n;
      leagueGames = c.league;
    }
    if (this.tableExists("league_matches")) {
      const live = this.db
        .prepare("SELECT COUNT(*) AS n FROM league_matches WHERE (p0 = ?1 OR p1 = ?1) AND status = 'done'")
        .get(playerId) as { n: number } | undefined;
      // correspondence league games are in both tables: the larger count, not the sum
      leagueGames = Math.max(leagueGames, live?.n ?? 0);
    }
    return { ...EMPTY_CAREER, games, wins, winsBy, corrFinished, leagueGames };
  }

  /** Achievements the server can grant (and check) from its own records. */
  verifiedAchievements(playerId: string): string[] {
    const one = (sql: string) => !!this.db.prepare(sql).get(playerId);
    const out: string[] = [];
    if (one("SELECT 1 FROM matches WHERE (p0 = ?1 AND winner = 0) OR (p1 = ?1 AND winner = 1) LIMIT 1"))
      out.push("online-win");
    if (one("SELECT 1 FROM ratings WHERE player_id = ? AND rating >= 1600 AND matches > 0 LIMIT 1"))
      out.push("rating-1600");
    if (this.tableExists("tournaments") && one("SELECT 1 FROM tournaments WHERE winner = ? LIMIT 1"))
      out.push("tournament-win");
    if (this.tableExists("leagues") && one("SELECT 1 FROM leagues WHERE winner = ? LIMIT 1"))
      out.push("league-win");
    const c = this.verifiedCareer(playerId);
    if (c.corrFinished >= 10) out.push("corr-ten");
    if (c.leagueGames >= 1) out.push("league-player");
    if (one("SELECT 1 FROM month_winners WHERE player_id = ? AND place = 1 LIMIT 1"))
      out.push("month-winner");
    return out;
  }

  /** Sets a rating directly (administration and tests). */
  setRating(playerId: string, variant: MatchVariantId, rating: number, pool: RatingPool = "normal"): void {
    this.db
      .prepare(
        `INSERT INTO ratings (player_id, variant, rating, experience, matches, wins) VALUES (?, ?, ?, 0, 0, 0)
         ON CONFLICT(player_id, variant) DO UPDATE SET rating = excluded.rating`,
      )
      .run(playerId, ratingKey(variant, pool), rating);
  }

  /** Stores a finished match and updates both ratings atomically. Returns the rating deltas per seat. */
  saveMatch(m: FinishedMatch): [number, number] {
    const loser = m.winner === 0 ? 1 : 0;
    const pool = m.pool ?? "normal";
    const r = [
      this.rating(m.players[0], m.variant, pool),
      this.rating(m.players[1], m.variant, pool),
    ] as const;
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
            ratingKey(m.variant, pool),
            r[seat].rating + deltas[seat],
            r[seat].experience + m.length,
            seat === m.winner ? 1 : 0,
          );
        }
      }
      this.db
        .prepare(
          `INSERT INTO matches (id, variant, length, p0, p1, winner, score0, score1, reason,
            rating_delta0, rating_delta1, games, started_at, ended_at, fairness, pool)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          pool,
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

  leaderboard(variant: MatchVariantId, limit = 50, pool: RatingPool = "normal"): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.name, ${this.frameSql} AS frame, p.club_rank, ${this.supporterSql} AS supporter, r.rating, r.matches, r.wins FROM ratings r
         JOIN players p ON p.id = r.player_id
         WHERE r.variant = ? AND r.matches > 0 AND p.banned_at IS NULL ORDER BY r.rating DESC LIMIT ?`,
      )
      .all(ratingKey(variant, pool), limit) as {
      player_id: string;
      name: string;
      frame: Frame | null;
      club_rank: number;
      supporter: number;
      rating: number;
      matches: number;
      wins: number;
    }[];
    return rows.map((r) => ({
      playerId: r.player_id,
      name: r.name,
      frame: r.frame,
      rank: r.club_rank,
      ...(r.supporter ? { supporter: true } : {}),
      variant,
      ...(pool === "normal" ? {} : { pool }),
      rating: Math.round(r.rating),
      matches: r.matches,
      wins: r.wins,
    }));
  }

  /** Name, frame, club rank and supporter badge of the players of a ranking. */
  private boardPlayers(ids: readonly string[]): Map<string, Omit<MonthEntry, "gain" | "matches" | "rating">> {
    const out = new Map<string, Omit<MonthEntry, "gain" | "matches" | "rating">>();
    if (ids.length === 0) return out;
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, ${this.frameSql} AS frame, p.club_rank, ${this.supporterSql} AS supporter FROM players p
         WHERE p.id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as {
      id: string;
      name: string;
      frame: Frame | null;
      club_rank: number;
      supporter: number;
    }[];
    for (const r of rows)
      out.set(r.id, {
        playerId: r.id,
        name: r.name,
        frame: r.frame,
        rank: r.club_rank,
        ...(r.supporter ? { supporter: true } : {}),
      });
    return out;
  }

  /**
   * Rating gained in a month per player for one rating (rated matches only), best first. Banned,
   * deleted and unlisted players are left out; so are those below the minimum of matches.
   */
  private monthGains(month: string, key: string, limit: number): { pid: string; gain: number; n: number }[] {
    const [variant, pool = "normal"] = key.split("@");
    const [from, to] = monthRange(month);
    return this.db
      .prepare(
        `WITH m AS (
           SELECT p0 AS pid, rating_delta0 AS d FROM matches
             WHERE variant = ?1 AND pool = ?2 AND ended_at >= ?3 AND ended_at < ?4 AND (rating_delta0 != 0 OR rating_delta1 != 0)
           UNION ALL
           SELECT p1, rating_delta1 FROM matches
             WHERE variant = ?1 AND pool = ?2 AND ended_at >= ?3 AND ended_at < ?4 AND (rating_delta0 != 0 OR rating_delta1 != 0)
         )
         SELECT m.pid, SUM(m.d) AS gain, COUNT(*) AS n FROM m JOIN players p ON p.id = m.pid
         WHERE p.banned_at IS NULL AND p.deleted_at IS NULL AND p.listed = 1
         GROUP BY m.pid HAVING n >= ?5 ORDER BY gain DESC LIMIT ?6`,
      )
      .all(variant, pool, from, to, BOARDS.monthMinMatches, limit) as {
      pid: string;
      gain: number;
      n: number;
    }[];
  }

  /** The monthly ranking of one rating, with the archived podium of the month before. */
  monthBoard(variant: MatchVariantId, pool: RatingPool = "normal", now = Date.now(), limit = 50): MonthBoard {
    const key = ratingKey(variant, pool);
    const month = monthOf(now);
    const rows = this.monthGains(month, key, limit);
    const podium = this.db
      .prepare(
        "SELECT player_id AS pid, gain, matches AS n FROM month_winners WHERE month = ? AND variant = ? ORDER BY place",
      )
      .all(previousMonth(month), key) as { pid: string; gain: number; n: number }[];
    const players = this.boardPlayers([...rows, ...podium].map((r) => r.pid));
    const entry = (r: { pid: string; gain: number; n: number }): MonthEntry | null => {
      const p = players.get(r.pid);
      return p
        ? {
            ...p,
            gain: Math.round(r.gain),
            matches: r.n,
            rating: Math.round(this.rating(r.pid, variant, pool).rating),
          }
        : null;
    };
    return {
      month,
      minMatches: BOARDS.monthMinMatches,
      entries: rows.map(entry).filter((e): e is MonthEntry => e !== null),
      previous: podium.map(entry).filter((e): e is MonthEntry => e !== null),
    };
  }

  /**
   * Activity: finished matches of every kind in the last days, at most a few against the same
   * opponent per day; banned, deleted and unlisted players are left out.
   */
  activeBoard(now = Date.now(), limit = 50): ActiveBoard {
    const since = new Date(now - BOARDS.activeDays * DAY).toISOString();
    const rows = this.db
      .prepare(
        `WITH m AS (
           SELECT p0 AS pid, p1 AS opp, substr(ended_at, 1, 10) AS day FROM matches WHERE ended_at >= ?1
           UNION ALL
           SELECT p1, p0, substr(ended_at, 1, 10) FROM matches WHERE ended_at >= ?1
         ),
         c AS (SELECT pid, MIN(COUNT(*), ?2) AS n FROM m GROUP BY pid, opp, day)
         SELECT c.pid, SUM(c.n) AS n FROM c JOIN players p ON p.id = c.pid
         WHERE p.banned_at IS NULL AND p.deleted_at IS NULL AND p.listed = 1
         GROUP BY c.pid HAVING SUM(c.n) >= ?3 ORDER BY n DESC, c.pid LIMIT ?4`,
      )
      .all(since, BOARDS.perOpponentDay, BOARDS.activeMin, limit) as { pid: string; n: number }[];
    const players = this.boardPlayers(rows.map((r) => r.pid));
    const entries: ActiveEntry[] = [];
    for (const r of rows) {
      const p = players.get(r.pid);
      if (p) entries.push({ ...p, matches: r.n });
    }
    return { days: BOARDS.activeDays, perOpponentDay: BOARDS.perOpponentDay, entries };
  }

  /**
   * Keeps the podium (top 3) of every finished month that is not archived yet, for each rating
   * with rated matches in it. Runs with the daily maintenance; returns the newly archived months.
   */
  archiveMonths(now = Date.now()): string[] {
    const current = monthOf(now);
    const first = this.db.prepare("SELECT MIN(ended_at) AS t FROM matches").get() as { t: string | null };
    if (!first.t) return [];
    const done: string[] = [];
    for (let month = previousMonth(current); month >= first.t.slice(0, 7); month = previousMonth(month)) {
      if (this.db.prepare("SELECT 1 FROM month_archive WHERE month = ?").get(month)) break;
      const [from, to] = monthRange(month);
      const keys = this.db
        .prepare(
          "SELECT DISTINCT variant, pool FROM matches WHERE ended_at >= ? AND ended_at < ? AND (rating_delta0 != 0 OR rating_delta1 != 0)",
        )
        .all(from, to) as { variant: MatchVariantId; pool: RatingPool }[];
      this.db.exec("BEGIN");
      try {
        for (const k of keys) {
          const key = ratingKey(k.variant, k.pool);
          this.monthGains(month, key, 3).forEach((g, i) => {
            this.db
              .prepare(
                "INSERT OR REPLACE INTO month_winners (month, variant, place, player_id, gain, matches) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .run(month, key, i + 1, g.pid, g.gain, g.n);
          });
        }
        this.db
          .prepare("INSERT INTO month_archive (month, archived_at) VALUES (?, ?)")
          .run(month, new Date(now).toISOString());
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
      done.push(month);
    }
    return done;
  }

  /** Podium places of a player in monthly rankings, newest first. */
  trophies(playerId: string): Trophy[] {
    const rows = this.db
      .prepare(
        "SELECT month, variant, place FROM month_winners WHERE player_id = ? ORDER BY month DESC, place",
      )
      .all(playerId) as { month: string; variant: string; place: 1 | 2 | 3 }[];
    return rows.map((r) => {
      const [variant, pool] = r.variant.split("@") as [MatchVariantId, RatingPool?];
      return { month: r.month, variant, ...(pool ? { pool } : {}), place: r.place };
    });
  }

  profile(playerId: string): ProfileResponse | null {
    const p = this.getPlayer(playerId);
    if (!p) return null;
    const ratings = (
      this.db
        .prepare("SELECT variant, rating, matches, wins FROM ratings WHERE player_id = ? ORDER BY variant")
        .all(playerId) as { variant: string; rating: number; matches: number; wins: number }[]
    ).map((r) => {
      const [variant, pool] = r.variant.split("@") as [MatchVariantId, RatingPool?];
      return { ...r, variant, ...(pool ? { pool } : {}), rating: Math.round(r.rating) };
    });
    const recent = this.db
      .prepare(`SELECT id FROM matches WHERE p0 = ? OR p1 = ? ORDER BY ended_at DESC LIMIT 20`)
      .all(playerId, playerId) as { id: string }[];
    const pub = this.boardPlayers([playerId]).get(playerId);
    const since = this.db.prepare("SELECT created_at, showcase FROM players WHERE id = ?").get(playerId) as
      | { created_at: string; showcase: string | null }
      | undefined;
    return {
      id: p.id,
      name: p.name,
      frame: pub?.frame ?? null,
      rank: pub?.rank ?? 0,
      ...(pub?.supporter ? { supporter: true } : {}),
      since: since?.created_at.slice(0, 7),
      trophies: this.trophies(playerId),
      showcase: this.parseShowcase(since?.showcase ?? null),
      ratings,
      recent: recent.map((r) => this.matchSummary(r.id)).filter((x): x is MatchSummary => x !== null),
      history: this.ratingHistory(playerId),
      leaguesWon: this.tableExists("leagues")
        ? (
            this.db.prepare("SELECT COUNT(*) AS n FROM leagues WHERE winner = ?").get(playerId) as {
              n: number;
            }
          ).n
        : 0,
    };
  }

  /**
   * Rating after each of the last rated matches per variant, rebuilt backwards from the current
   * rating with the stored rating changes.
   */
  ratingHistory(playerId: string, limit = 100): Record<string, RatingPoint[]> {
    const out: Record<string, RatingPoint[]> = {};
    const current = this.db
      .prepare("SELECT variant, rating FROM ratings WHERE player_id = ?")
      .all(playerId) as { variant: string; rating: number }[];
    for (const { variant: key, rating } of current) {
      const [variant, pool = "normal"] = key.split("@");
      const rows = this.db
        .prepare(
          `SELECT ended_at, CASE WHEN p0 = ?1 THEN rating_delta0 ELSE rating_delta1 END AS delta FROM matches
           WHERE (p0 = ?1 OR p1 = ?1) AND variant = ?2 AND pool = ?4 AND (rating_delta0 != 0 OR rating_delta1 != 0)
           ORDER BY ended_at DESC LIMIT ?3`,
        )
        .all(playerId, variant!, limit, pool) as { ended_at: string; delta: number }[];
      let r = rating;
      const points: RatingPoint[] = [];
      for (const row of rows) {
        points.push({ at: row.ended_at, rating: Math.round(r) });
        r -= row.delta;
      }
      points.push({ at: rows[rows.length - 1]?.ended_at ?? new Date().toISOString(), rating: Math.round(r) });
      out[key] = points.reverse();
    }
    return out;
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
  analysisSummary(playerId: string, from = this.since(SIGNALS.days), to?: string): AnalysisSummary | null {
    const row = this.db
      .prepare(
        "SELECT SUM(decisions) AS d, SUM(agree) AS a, SUM(loss) AS l FROM analyses WHERE player_id = ? AND created_at >= ? AND created_at < ?",
      )
      .get(playerId, from, to ?? "9999") as { d: number | null; a: number | null; l: number | null };
    if (!row.d) return null;
    return { decisions: row.d, agreement: (row.a ?? 0) / row.d, averageLoss: (row.l ?? 0) / row.d };
  }

  /**
   * The player's own accuracy: the last 90 days, the 90 before (trend) and the last analysed
   * matches. Only for the player themselves; others never see it.
   */
  accuracy(playerId: string, now = Date.now()): AccuracyReport {
    const day = 24 * 60 * 60 * 1000;
    const recent = new Date(now - SIGNALS.days * day).toISOString();
    const older = new Date(now - 2 * SIGNALS.days * day).toISOString();
    const matches = (
      this.db
        .prepare(
          "SELECT match_id, decisions, agree, loss, created_at FROM analyses WHERE player_id = ? AND decisions > 0 ORDER BY created_at DESC LIMIT 30",
        )
        .all(playerId) as {
        match_id: string;
        decisions: number;
        agree: number;
        loss: number;
        created_at: string;
      }[]
    ).map((r) => ({
      matchId: r.match_id,
      at: r.created_at,
      decisions: r.decisions,
      agreement: r.agree / r.decisions,
      averageLoss: r.loss / r.decisions,
    }));
    return {
      summary: this.analysisSummary(playerId, recent),
      before: this.analysisSummary(playerId, older, recent),
      matches,
    };
  }

  private playerRef(id: string): PublicPlayerRef {
    const row = this.db.prepare("SELECT name, banned_at FROM players WHERE id = ?").get(id) as
      | { name: string; banned_at: string | null }
      | undefined;
    return { id, name: row?.name ?? "?", banned: !!row?.banned_at };
  }

  /** Fair-play signals for the moderation screen. */
  /** Player numbers for moderators: totals, active and new players per period. */
  playerStats(): Omit<PlayerStats, "online" | "playing"> {
    const count = (sql: string, ...args: string[]) => (this.db.prepare(sql).get(...args) as { n: number }).n;
    const period = (column: string): PeriodCounts => {
      const n = (days: number) =>
        count(`SELECT COUNT(*) AS n FROM players WHERE ${column} >= ?`, this.since(days));
      return { d1: n(1), d7: n(7), d30: n(30) };
    };
    const total = count("SELECT COUNT(*) AS n FROM players");
    const registered = count("SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL");
    return {
      total,
      registered,
      guests: total - registered,
      active: period("COALESCE(last_seen, created_at)"),
      created: period("created_at"),
    };
  }

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
