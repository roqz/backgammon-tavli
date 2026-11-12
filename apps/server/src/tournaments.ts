import { randomUUID } from "node:crypto";
import type {
  MatchVariantId,
  TournamentMatchView,
  TournamentPlayer,
  TournamentRef,
  TournamentStatus,
  TournamentView,
} from "@tavli/protocol";
import type { Store } from "./db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variant TEXT NOT NULL,
  length INTEGER NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  winner TEXT
);
CREATE INDEX IF NOT EXISTS tournaments_status ON tournaments(status, created_at);
CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER,
  withdrawn INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, player_id)
);
CREATE TABLE IF NOT EXISTS tournament_matches (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  p0 TEXT,
  p1 TEXT,
  status TEXT NOT NULL,
  match_id TEXT,
  winner TEXT,
  walkover INTEGER NOT NULL DEFAULT 0,
  score0 INTEGER,
  score1 INTEGER,
  ready_at INTEGER,
  PRIMARY KEY (tournament_id, round, slot)
);
`;

export interface TournamentOptions {
  /** How long a ready match waits for an absent player before it is decided as a walkover. */
  readonly noShowMs: number;
  /** Open tournaments that do not fill up in this time are cancelled. */
  readonly openTtlMs: number;
  /** Pause before a ready match starts, so players can look at the previous result. */
  readonly startDelayMs: number;
}

export const DEFAULT_TOURNAMENT_OPTIONS: TournamentOptions = {
  noShowMs: 5 * 60_000,
  openTtlMs: 24 * 60 * 60_000,
  startDelayMs: 10_000,
};

/** What the tournament manager needs from the lobby. */
export interface TournamentHost {
  /** Connected and not playing a match. */
  isAvailable(playerId: string): boolean;
  /** Starts a tournament match (p0 = better seed) and returns the room id. */
  startTournamentMatch(
    variant: MatchVariantId,
    length: number,
    p0: string,
    p1: string,
    ref: TournamentRef,
    slot: number,
  ): string;
  /** Sends the tournament state to a connected player. */
  push(playerId: string, view: TournamentView): void;
}

export class TournamentError extends Error {}

interface TournamentRow {
  id: string;
  name: string;
  variant: MatchVariantId;
  length: number;
  size: number;
  status: TournamentStatus;
  created_by: string;
  created_at: string;
  winner: string | null;
}

interface EntryRow {
  player_id: string;
  seed: number | null;
  withdrawn: number;
}

interface MatchRow {
  round: number;
  slot: number;
  p0: string | null;
  p1: string | null;
  status: TournamentMatchView["status"];
  match_id: string | null;
  winner: string | null;
  walkover: number;
  score0: number | null;
  score1: number | null;
  ready_at: number | null;
}

/** Standard bracket order so that the best seeds meet last: 4 → [1, 4, 2, 3]. */
export const seedOrder = (n: number): number[] => {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
};

const rounds = (size: number) => Math.round(Math.log2(size));

/**
 * Knockout tournaments: players join until the bracket is full, seeds follow the rating, every
 * match is a normal online match that starts once both players are online and free. Absent or
 * withdrawn players lose by walkover. State lives in SQLite and survives restarts (a match that
 * was running during a restart is played again).
 */
export class Tournaments {
  private readonly opts: TournamentOptions;

  constructor(
    private readonly store: Store,
    private readonly host: TournamentHost,
    opts: Partial<TournamentOptions> = {},
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.opts = { ...DEFAULT_TOURNAMENT_OPTIONS, ...opts };
    store.db.exec(SCHEMA);
    // Rooms do not survive a restart: replay those matches.
    store.db
      .prepare(
        "UPDATE tournament_matches SET status = 'ready', match_id = NULL, ready_at = ? WHERE status = 'playing'",
      )
      .run(Date.now());
  }

  private get db() {
    return this.store.db;
  }

  // ---- queries ---------------------------------------------------------------------------------

  private row(id: string): TournamentRow | undefined {
    return this.db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id) as TournamentRow | undefined;
  }

  private entries(id: string): EntryRow[] {
    return this.db
      .prepare(
        "SELECT player_id, seed, withdrawn FROM tournament_entries WHERE tournament_id = ? ORDER BY joined_at",
      )
      .all(id) as unknown as EntryRow[];
  }

  private matches(id: string): MatchRow[] {
    return this.db
      .prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, slot")
      .all(id) as unknown as MatchRow[];
  }

  view(id: string): TournamentView | null {
    const t = this.row(id);
    if (!t) return null;
    const players: TournamentPlayer[] = this.entries(id).map((e) => ({
      ...this.store.publicPlayer(e.player_id, t.variant),
      seed: e.seed,
      withdrawn: e.withdrawn === 1,
    }));
    const byRound: TournamentMatchView[][] = Array.from(
      { length: t.status === "open" ? 0 : rounds(t.size) },
      () => [],
    );
    for (const m of this.matches(id)) {
      byRound[m.round]?.push({
        round: m.round,
        slot: m.slot,
        players: [m.p0, m.p1],
        status: m.status,
        winner: m.winner,
        matchId: m.match_id,
        score: m.score0 === null || m.score1 === null ? null : [m.score0, m.score1],
        walkover: m.walkover === 1,
      });
    }
    return {
      id: t.id,
      name: t.name,
      variant: t.variant,
      length: t.length,
      size: t.size,
      status: t.status,
      createdBy: { id: t.created_by, name: this.store.getPlayer(t.created_by)?.name ?? "?" },
      createdAt: t.created_at,
      players,
      rounds: byRound,
      winner: t.winner,
    };
  }

  /** Open and running tournaments plus the most recently finished ones. */
  list(): TournamentView[] {
    const ids = this.db
      .prepare(
        `SELECT id FROM tournaments WHERE status IN ('open', 'running')
         UNION ALL
         SELECT id FROM (SELECT id FROM tournaments WHERE status = 'finished' ORDER BY finished_at DESC LIMIT 20)`,
      )
      .all() as { id: string }[];
    return ids.map((r) => this.view(r.id)!).filter(Boolean);
  }

  /** A tournament the player is still active in (open, or running and not yet eliminated). */
  private activeTournamentOf(playerId: string): string | null {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.status, e.withdrawn FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
         WHERE e.player_id = ? AND t.status IN ('open', 'running')`,
      )
      .all(playerId) as { id: string; status: TournamentStatus; withdrawn: number }[];
    for (const r of rows) {
      if (r.withdrawn) continue;
      if (r.status === "open") return r.id;
      const lost = this.db
        .prepare(
          `SELECT 1 FROM tournament_matches WHERE tournament_id = ? AND status = 'done'
           AND (p0 = ?2 OR p1 = ?2) AND winner != ?2`,
        )
        .get(r.id, playerId);
      if (!lost) return r.id;
    }
    return null;
  }

  // ---- actions ---------------------------------------------------------------------------------

  create(
    playerId: string,
    name: string,
    variant: MatchVariantId,
    length: number,
    size: number,
  ): TournamentView {
    if (this.activeTournamentOf(playerId)) throw new TournamentError("already in a tournament");
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO tournaments (id, name, variant, length, size, status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
      .run(id, name, variant, length, size, playerId, new Date().toISOString());
    this.addEntry(id, playerId);
    this.log(`tournament ${id} created (${variant}/${length}, ${size} players)`);
    return this.changed(id)!;
  }

  join(playerId: string, id: string): TournamentView {
    const t = this.row(id);
    if (t?.status !== "open") throw new TournamentError("tournament not open");
    if (this.entries(id).some((e) => e.player_id === playerId)) return this.changed(id)!;
    if (this.activeTournamentOf(playerId)) throw new TournamentError("already in a tournament");
    this.addEntry(id, playerId);
    if (this.entries(id).length >= t.size) this.start(id);
    return this.changed(id)!;
  }

  /** Leaves an open tournament or withdraws from a running one. */
  leave(playerId: string, id: string): void {
    const t = this.row(id);
    if (!t || !this.entries(id).some((e) => e.player_id === playerId)) return;
    if (t.status === "open") {
      this.db
        .prepare("DELETE FROM tournament_entries WHERE tournament_id = ? AND player_id = ?")
        .run(id, playerId);
      if (this.entries(id).length === 0)
        this.db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?").run(id);
      this.changed(id, [playerId]);
      return;
    }
    if (t.status !== "running") return;
    this.db
      .prepare("UPDATE tournament_entries SET withdrawn = 1 WHERE tournament_id = ? AND player_id = ?")
      .run(id, playerId);
    this.tick();
    this.changed(id);
  }

  private addEntry(id: string, playerId: string): void {
    this.db
      .prepare("INSERT INTO tournament_entries (tournament_id, player_id, joined_at) VALUES (?, ?, ?)")
      .run(id, playerId, new Date().toISOString());
  }

  /** Seeds by rating (best first) and creates the first round. */
  private start(id: string): void {
    const t = this.row(id)!;
    const seeded = this.entries(id)
      .map((e) => ({ id: e.player_id, rating: this.store.rating(e.player_id, t.variant).rating }))
      .sort((a, b) => b.rating - a.rating);
    const setSeed = this.db.prepare(
      "UPDATE tournament_entries SET seed = ? WHERE tournament_id = ? AND player_id = ?",
    );
    for (const [i, p] of seeded.entries()) setSeed.run(i + 1, id, p.id);
    const order = seedOrder(t.size);
    const insert = this.db.prepare(
      `INSERT INTO tournament_matches (tournament_id, round, slot, p0, p1, status, ready_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (let r = 0; r < rounds(t.size); r++) {
      const slots = t.size >> (r + 1);
      for (let slot = 0; slot < slots; slot++) {
        if (r === 0) {
          const a = seeded[order[slot * 2]! - 1]!.id;
          const b = seeded[order[slot * 2 + 1]! - 1]!.id;
          insert.run(id, 0, slot, a, b, "ready", now);
        } else insert.run(id, r, slot, null, null, "waiting", null);
      }
    }
    this.db
      .prepare("UPDATE tournaments SET status = 'running', started_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    this.log(`tournament ${id} started`);
  }

  /** A tournament room ended (also by forfeit). */
  matchEnded(ref: TournamentRef, slot: number, winnerId: string, score: readonly [number, number]): void {
    this.decide(ref.id, ref.round, slot, winnerId, false, score);
    this.changed(ref.id);
  }

  private decide(
    id: string,
    round: number,
    slot: number,
    winner: string,
    walkover: boolean,
    score: readonly [number, number] | null = null,
  ): void {
    this.db
      .prepare(
        `UPDATE tournament_matches SET status = 'done', winner = ?, walkover = ?, score0 = ?, score1 = ?
         WHERE tournament_id = ? AND round = ? AND slot = ?`,
      )
      .run(winner, walkover ? 1 : 0, score?.[0] ?? null, score?.[1] ?? null, id, round, slot);
    const t = this.row(id)!;
    if (round === rounds(t.size) - 1) {
      this.db
        .prepare("UPDATE tournaments SET status = 'finished', finished_at = ?, winner = ? WHERE id = ?")
        .run(new Date().toISOString(), winner, id);
      this.log(`tournament ${id} won by ${winner}`);
      return;
    }
    const next = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? "p0" : "p1";
    this.db
      .prepare(`UPDATE tournament_matches SET ${side} = ? WHERE tournament_id = ? AND round = ? AND slot = ?`)
      .run(winner, id, round + 1, next);
    const m = this.db
      .prepare("SELECT p0, p1 FROM tournament_matches WHERE tournament_id = ? AND round = ? AND slot = ?")
      .get(id, round + 1, next) as { p0: string | null; p1: string | null };
    if (m.p0 && m.p1) {
      this.db
        .prepare(
          "UPDATE tournament_matches SET status = 'ready', ready_at = ? WHERE tournament_id = ? AND round = ? AND slot = ?",
        )
        .run(Date.now(), id, round + 1, next);
    }
  }

  /**
   * Periodic work: start ready matches whose players are both available, decide walkovers for
   * absent or withdrawn players, cancel stale open tournaments.
   */
  tick(): void {
    const now = Date.now();
    const stale = this.db
      .prepare("SELECT id FROM tournaments WHERE status = 'open' AND created_at < ?")
      .all(new Date(now - this.opts.openTtlMs).toISOString()) as { id: string }[];
    for (const { id } of stale) {
      this.db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?").run(id);
      this.changed(id);
    }
    const ready = this.db
      .prepare(
        `SELECT m.tournament_id AS id, m.round, m.slot, m.p0, m.p1, m.ready_at, t.variant, t.length, t.name, t.size
         FROM tournament_matches m JOIN tournaments t ON t.id = m.tournament_id
         WHERE m.status = 'ready' AND t.status = 'running' ORDER BY m.round, m.slot`,
      )
      .all() as {
      id: string;
      round: number;
      slot: number;
      p0: string;
      p1: string;
      ready_at: number;
      variant: MatchVariantId;
      length: number;
      name: string;
      size: number;
    }[];
    for (const m of ready) {
      const withdrawn = new Set(
        this.entries(m.id)
          .filter((e) => e.withdrawn)
          .map((e) => e.player_id),
      );
      const out0 = withdrawn.has(m.p0);
      const out1 = withdrawn.has(m.p1);
      if (out0 || out1) {
        // Withdrawn players lose; if both withdrew, the better seed (p0) goes on as a formality.
        this.decide(m.id, m.round, m.slot, out0 && !out1 ? m.p1 : m.p0, true);
        this.changed(m.id);
        continue;
      }
      const a0 = this.host.isAvailable(m.p0);
      const a1 = this.host.isAvailable(m.p1);
      if (a0 && a1 && now - m.ready_at >= this.opts.startDelayMs) {
        const ref: TournamentRef = { id: m.id, name: m.name, round: m.round, rounds: rounds(m.size) };
        const matchId = this.host.startTournamentMatch(m.variant, m.length, m.p0, m.p1, ref, m.slot);
        this.db
          .prepare(
            "UPDATE tournament_matches SET status = 'playing', match_id = ? WHERE tournament_id = ? AND round = ? AND slot = ?",
          )
          .run(matchId, m.id, m.round, m.slot);
        this.changed(m.id);
        continue;
      }
      const waited = now - m.ready_at;
      if (waited > this.opts.noShowMs && a0 !== a1) {
        this.decide(m.id, m.round, m.slot, a0 ? m.p0 : m.p1, true);
        this.changed(m.id);
      } else if (waited > 2 * this.opts.noShowMs && !a0 && !a1) {
        this.decide(m.id, m.round, m.slot, m.p0, true);
        this.changed(m.id);
      }
    }
  }

  /** Pushes the new state to all participants (and `extra` players) and returns it. */
  private changed(id: string, extra: readonly string[] = []): TournamentView | null {
    const v = this.view(id);
    if (!v) return null;
    for (const pid of new Set([...v.players.map((p) => p.id), ...extra])) this.host.push(pid, v);
    return v;
  }
}
