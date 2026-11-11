import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { TurnRecord } from "@tavli/engine";
import type {
  LeaderboardEntry,
  MatchEndReason,
  MatchSummary,
  MatchVariantId,
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
`;

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export interface PlayerRow {
  readonly id: string;
  readonly name: string;
}

/** A finished game inside a match, kept for replays. */
export interface StoredGame {
  readonly variant: string;
  readonly history: readonly TurnRecord[];
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
}

/** Persistence on SQLite (node:sqlite): guest players, per-variant FIBS ratings, match archive. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
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

  /** Returns the player if the token matches. */
  authenticate(id: string, token: string): PlayerRow | null {
    const row = this.db.prepare("SELECT id, name, token_hash FROM players WHERE id = ?").get(id) as
      | { id: string; name: string; token_hash: string }
      | undefined;
    if (!row) return null;
    const expected = Buffer.from(row.token_hash, "hex");
    const actual = hashToken(token);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return { id: row.id, name: row.name };
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
            rating_delta0, rating_delta1, games, started_at, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return deltas;
  }

  leaderboard(variant: MatchVariantId, limit = 50): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.name, r.rating, r.matches, r.wins FROM ratings r
         JOIN players p ON p.id = r.player_id
         WHERE r.variant = ? AND r.matches > 0 ORDER BY r.rating DESC LIMIT ?`,
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

  matchGames(id: string): StoredGame[] | null {
    const row = this.db.prepare("SELECT games FROM matches WHERE id = ?").get(id) as
      | { games: string }
      | undefined;
    return row ? (JSON.parse(row.games) as StoredGame[]) : null;
  }
}
