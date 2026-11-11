import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { GameResult, TurnRecord } from "@tavli/engine";
import type {
  AdminReport,
  FairnessReveal,
  LeaderboardEntry,
  MatchEndReason,
  MatchSummary,
  MatchVariantId,
  ModerationInfo,
  ProfileResponse,
  PublicPlayer,
  RatingEntry,
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
`;

/** Columns added after the first release (applied once, idempotent). */
const MIGRATIONS: readonly [table: string, column: string, ddl: string][] = [
  ["players", "username", "ALTER TABLE players ADD COLUMN username TEXT"],
  ["players", "password_hash", "ALTER TABLE players ADD COLUMN password_hash TEXT"],
  ["players", "email", "ALTER TABLE players ADD COLUMN email TEXT"],
  ["matches", "fairness", "ALTER TABLE matches ADD COLUMN fairness TEXT"],
  ["players", "banned_at", "ALTER TABLE players ADD COLUMN banned_at TEXT"],
  ["players", "ban_reason", "ALTER TABLE players ADD COLUMN ban_reason TEXT"],
];

/** How many reports one player may file per day. */
export const REPORTS_PER_DAY = 10;

/** Errors a client may see, with an HTTP status. */
export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(expected, actual);
};

/** Dummy hash so failed logins for unknown users cost the same time as wrong passwords. */
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

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
}

/** Persistence on SQLite (node:sqlite): guest players, per-variant FIBS ratings, match archive. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    for (const [table, column, ddl] of MIGRATIONS) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) this.db.exec(ddl);
    }
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS players_username ON players(lower(username))");
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

  /** Returns the player if the token matches (the guest token or a login session). */
  authenticate(id: string, token: string): PlayerRow | null {
    const row = this.db.prepare("SELECT id, name, token_hash, banned_at FROM players WHERE id = ?").get(id) as
      | { id: string; name: string; token_hash: string; banned_at: string | null }
      | undefined;
    if (!row) return null;
    const player: PlayerRow = { id: row.id, name: row.name, banned: row.banned_at !== null };
    const actual = hashToken(token);
    const expected = Buffer.from(row.token_hash, "hex");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return player;
    const key = actual.toString("hex");
    const session = this.db.prepare("SELECT player_id FROM sessions WHERE token_hash = ?").get(key) as
      | { player_id: string }
      | undefined;
    if (session?.player_id !== id) return null;
    this.db
      .prepare("UPDATE sessions SET last_used = ? WHERE token_hash = ?")
      .run(new Date().toISOString(), key);
    return player;
  }

  account(id: string): AccountRow | null {
    const row = this.db.prepare("SELECT id, name, username, email FROM players WHERE id = ?").get(id) as
      | AccountRow
      | undefined;
    return row ?? null;
  }

  /** Turns a guest profile into an account with username and password (ratings stay). */
  claimAccount(id: string, username: string, password: string, email: string | null): AccountRow {
    const current = this.account(id);
    if (!current) throw new AccountError(404, "unknown player");
    if (current.username) throw new AccountError(409, "account already exists");
    const taken = this.db.prepare("SELECT 1 FROM players WHERE lower(username) = lower(?)").get(username);
    if (taken) throw new AccountError(409, "username taken");
    this.db
      .prepare("UPDATE players SET username = ?, password_hash = ?, email = ? WHERE id = ?")
      .run(username, hashPassword(password), email, id);
    return this.account(id)!;
  }

  /** Checks credentials and opens a new session (one per device). */
  login(username: string, password: string): { id: string; token: string; name: string } {
    const row = this.db
      .prepare("SELECT id, name, password_hash, banned_at FROM players WHERE lower(username) = lower(?)")
      .get(username) as
      | { id: string; name: string; password_hash: string | null; banned_at: string | null }
      | undefined;
    const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row?.password_hash || !ok) throw new AccountError(401, "wrong username or password");
    if (row.banned_at) throw new AccountError(403, "banned");
    const token = randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (token_hash, player_id, created_at, last_used) VALUES (?, ?, ?, ?)")
      .run(hashToken(token).toString("hex"), row.id, now, now);
    return { id: row.id, token, name: row.name };
  }

  /** Ends a login session (the guest token of the first device stays valid). */
  logout(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token).toString("hex"));
  }

  changePassword(id: string, oldPassword: string, newPassword: string): void {
    const row = this.db.prepare("SELECT password_hash FROM players WHERE id = ?").get(id) as
      | { password_hash: string | null }
      | undefined;
    if (!row?.password_hash || !verifyPassword(oldPassword, row.password_hash)) {
      throw new AccountError(401, "wrong password");
    }
    this.db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), id);
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
