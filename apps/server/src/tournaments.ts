import { randomUUID } from "node:crypto";
import {
  type MatchVariantId,
  poolOf,
  SCHEDULE_MAX_AHEAD_MS,
  SCHEDULE_MIN_AHEAD_MS,
  swissRounds,
  type TimeControl,
  TOURNAMENT_MIN_PLAYERS,
  type TournamentFormat,
  type TournamentMatchView,
  type TournamentPlayer,
  type TournamentRef,
  type TournamentStanding,
  type TournamentStatus,
  type TournamentView,
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
  winner TEXT,
  format TEXT NOT NULL DEFAULT 'knockout',
  club_id TEXT,
  clock TEXT NOT NULL DEFAULT 'relaxed',
  starts_at INTEGER
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
  /** Guests (no account) need this many finished matches before they may create a tournament. */
  readonly guestMinMatches: number;
  /** Open (not yet full) tournaments at the same time, against lobby spam. */
  readonly maxOpen: number;
}

export const DEFAULT_TOURNAMENT_OPTIONS: TournamentOptions = {
  noShowMs: 5 * 60_000,
  openTtlMs: 24 * 60 * 60_000,
  startDelayMs: 10_000,
  guestMinMatches: 3,
  maxOpen: 50,
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
    clock: TimeControl,
  ): string;
  /** Sends the tournament state to a connected player. */
  push(playerId: string, view: TournamentView): void;
  /** A match of this player became ready (used for notifications). */
  matchReady?(playerId: string, view: TournamentView, ref: TournamentRef): void;
  /** Club tournaments: the player's standing in the club, and the club's name. */
  clubRole?(clubId: string, playerId: string): "admin" | "member" | null;
  clubName?(clubId: string): string | null;
}

export class TournamentError extends Error {}

interface TournamentRow {
  id: string;
  name: string;
  variant: MatchVariantId;
  length: number;
  size: number;
  status: TournamentStatus;
  format: TournamentFormat;
  created_by: string;
  created_at: string;
  winner: string | null;
  club_id: string | null;
  clock: TimeControl;
  starts_at: number | null;
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

const knockoutRounds = (size: number) => Math.round(Math.log2(size));
const roundCount = (t: { size: number; format: TournamentFormat }) =>
  t.format === "swiss" ? swissRounds(t.size) : knockoutRounds(t.size);

const inOrder = (ranked: readonly string[]): [string, string][] => {
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < ranked.length; i += 2) out.push([ranked[i]!, ranked[i + 1]!]);
  return out;
};

/**
 * Swiss pairing: players in ranking order, each paired with the best-ranked opponent they have
 * not met yet (backtracking when the rest could not be paired). With an odd count the
 * lowest-ranked player without a bye so far sits out. Rematches only when nothing else works
 * (possible after withdrawals). Returns [better, worse] pairs and the player with the bye.
 */
export const swissPairs = (
  ranked: readonly string[],
  met: (a: string, b: string) => boolean,
  hadBye: (p: string) => boolean = () => false,
): { pairs: [string, string][]; bye: string | null } => {
  const pairUp = (rest: readonly string[]): [string, string][] | null => {
    if (rest.length === 0) return [];
    const [first, ...others] = rest as [string, ...string[]];
    for (const [i, o] of others.entries()) {
      if (met(first, o)) continue;
      const tail = pairUp(others.filter((_, j) => j !== i));
      if (tail) return [[first, o], ...tail];
    }
    return null;
  };
  if (ranked.length % 2 === 0) return { pairs: pairUp(ranked) ?? inOrder(ranked), bye: null };
  const fromBottom = [...ranked].reverse();
  for (const bye of [...fromBottom.filter((p) => !hadBye(p)), ...fromBottom.filter(hadBye)]) {
    const pairs = pairUp(ranked.filter((p) => p !== bye));
    if (pairs) return { pairs, bye };
  }
  const bye = fromBottom[0]!;
  return { pairs: inOrder(ranked.filter((p) => p !== bye)), bye };
};

/** Swiss table: wins, then Buchholz (sum of the opponents' wins), then seed. */
export const swissStandings = (
  players: readonly { id: string; seed: number | null }[],
  matches: readonly { p0: string | null; p1: string | null; status: string; winner: string | null }[],
): TournamentStanding[] => {
  const wins = new Map(players.map((p) => [p.id, 0]));
  const played = new Map(players.map((p) => [p.id, 0]));
  const opponents = new Map<string, string[]>(players.map((p) => [p.id, []]));
  for (const m of matches) {
    if (m.status !== "done") continue;
    for (const p of [m.p0, m.p1]) if (p) played.set(p, (played.get(p) ?? 0) + 1);
    if (m.winner) wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);
    if (m.p0 && m.p1) {
      opponents.get(m.p0)?.push(m.p1);
      opponents.get(m.p1)?.push(m.p0);
    }
  }
  const seed = (id: string) => players.find((p) => p.id === id)?.seed ?? 999;
  return players
    .map((p) => ({
      id: p.id,
      wins: wins.get(p.id) ?? 0,
      played: played.get(p.id) ?? 0,
      buchholz: (opponents.get(p.id) ?? []).reduce((s, o) => s + (wins.get(o) ?? 0), 0),
    }))
    .sort((a, b) => b.wins - a.wins || b.buchholz - a.buchholz || seed(a.id) - seed(b.id));
};

/**
 * Tournaments for 4, 8 or 16 players, seeded by rating. Every match is a normal online match that
 * starts once both players are online and free; absent or withdrawn players lose by walkover.
 * - knockout: the bracket is created at the start, winners move on.
 * - swiss: a fixed number of rounds, each paired after the previous one ended among players with
 *   the same number of wins; the table (wins, Buchholz) decides.
 * State lives in SQLite and survives restarts (a match that was running during a restart is
 * played again).
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
    const cols = store.db.prepare("PRAGMA table_info(tournaments)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "format"))
      store.db.exec("ALTER TABLE tournaments ADD COLUMN format TEXT NOT NULL DEFAULT 'knockout'");
    if (!cols.some((c) => c.name === "club_id"))
      store.db.exec("ALTER TABLE tournaments ADD COLUMN club_id TEXT");
    if (!cols.some((c) => c.name === "clock"))
      store.db.exec("ALTER TABLE tournaments ADD COLUMN clock TEXT NOT NULL DEFAULT 'relaxed'");
    if (!cols.some((c) => c.name === "starts_at"))
      store.db.exec("ALTER TABLE tournaments ADD COLUMN starts_at INTEGER");
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

  private standings(id: string, all: readonly MatchRow[] = this.matches(id)): TournamentStanding[] {
    return swissStandings(
      this.entries(id).map((e) => ({ id: e.player_id, seed: e.seed })),
      all,
    );
  }

  view(id: string): TournamentView | null {
    const t = this.row(id);
    if (!t) return null;
    const players: TournamentPlayer[] = this.entries(id).map((e) => ({
      ...this.store.publicPlayer(e.player_id, t.variant),
      seed: e.seed,
      withdrawn: e.withdrawn === 1,
    }));
    const all = this.matches(id);
    const shown =
      t.status === "open"
        ? 0
        : t.format === "swiss"
          ? Math.max(0, ...all.map((m) => m.round + 1))
          : knockoutRounds(t.size);
    const byRound: TournamentMatchView[][] = Array.from({ length: shown }, () => []);
    for (const m of all) {
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
      clock: t.clock,
      size: t.size,
      status: t.status,
      format: t.format,
      createdBy: { id: t.created_by, name: this.store.getPlayer(t.created_by)?.name ?? "?" },
      createdAt: t.created_at,
      players,
      rounds: byRound,
      roundCount: roundCount(t),
      standings: t.format === "swiss" && t.status !== "open" ? this.standings(id, all) : null,
      winner: t.winner,
      club: t.club_id ? { id: t.club_id, name: this.host.clubName?.(t.club_id) ?? "?" } : null,
      startsAt: t.starts_at,
    };
  }

  /**
   * Open and running tournaments plus the most recently finished ones: public tournaments and
   * those of the given clubs (the viewer's clubs).
   */
  list(clubIds: readonly string[] = []): TournamentView[] {
    const clubs = clubIds.slice(0, 50);
    const visible = `(club_id IS NULL${clubs.length ? ` OR club_id IN (${clubs.map(() => "?").join(", ")})` : ""})`;
    const ids = this.db
      .prepare(
        `SELECT id FROM (SELECT id FROM tournaments WHERE status IN ('open', 'running') AND ${visible} ORDER BY created_at DESC LIMIT 100)
         UNION ALL
         SELECT id FROM (SELECT id FROM tournaments WHERE status = 'finished' AND ${visible} ORDER BY finished_at DESC LIMIT 20)`,
      )
      .all(...clubs, ...clubs) as { id: string }[];
    return ids.map((r) => this.view(r.id)!).filter(Boolean);
  }

  /** A club's open and running tournaments and its five latest finished ones. */
  forClub(clubId: string): TournamentView[] {
    const ids = this.db
      .prepare(
        `SELECT id FROM (SELECT id FROM tournaments WHERE club_id = ?1 AND status IN ('open', 'running') ORDER BY created_at DESC)
         UNION ALL
         SELECT id FROM (SELECT id FROM tournaments WHERE club_id = ?1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 5)`,
      )
      .all(clubId) as { id: string }[];
    return ids.map((r) => this.view(r.id)!).filter(Boolean);
  }

  /**
   * A tournament the player is still active in: open, Swiss and not withdrawn, or knockout and
   * not yet eliminated.
   */
  private activeTournamentOf(playerId: string): string | null {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.status, t.format, e.withdrawn FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
         WHERE e.player_id = ? AND (t.status = 'running' OR (t.status = 'open' AND t.starts_at IS NULL))`,
      )
      .all(playerId) as {
      id: string;
      status: TournamentStatus;
      format: TournamentFormat;
      withdrawn: number;
    }[];
    for (const r of rows) {
      if (r.withdrawn) continue;
      if (r.status === "open" || r.format === "swiss") return r.id;
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
    format: TournamentFormat = "knockout",
    clubId: string | null = null,
    clock: TimeControl = "relaxed",
    startsAt: number | null = null,
  ): TournamentView {
    // entering a scheduled tournament does not block others until it starts
    if (startsAt === null && this.activeTournamentOf(playerId))
      throw new TournamentError("already in a tournament");
    if (startsAt !== null) {
      const ahead = startsAt - Date.now();
      if (ahead < SCHEDULE_MIN_AHEAD_MS || ahead > SCHEDULE_MAX_AHEAD_MS)
        throw new TournamentError("start time out of range");
    }
    if (clubId) {
      // club admins organise club tournaments (membership is the gate, not the guest rule)
      if (this.host.clubRole?.(clubId, playerId) !== "admin")
        throw new TournamentError("only club admins can do that");
    } else {
      const account = this.store.account(playerId);
      if (!account?.username && this.store.matchCount(playerId) < this.opts.guestMinMatches)
        throw new TournamentError("play a few matches or create an account first");
    }
    const open = this.db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'open'").get() as {
      n: number;
    };
    if (open.n >= this.opts.maxOpen) throw new TournamentError("too many open tournaments, join one");
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO tournaments (id, name, variant, length, size, status, created_by, created_at, format, club_id, clock, starts_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        variant,
        length,
        size,
        playerId,
        new Date().toISOString(),
        format,
        clubId,
        clock,
        startsAt,
      );
    this.addEntry(id, playerId);
    this.log(`tournament ${id} created (${format}, ${variant}/${length}, ${size} players)`);
    return this.changed(id)!;
  }

  join(playerId: string, id: string): TournamentView {
    const t = this.row(id);
    if (t?.status !== "open") throw new TournamentError("tournament not open");
    if (this.entries(id).some((e) => e.player_id === playerId)) return this.changed(id)!;
    if (t.club_id && !this.host.clubRole?.(t.club_id, playerId)) throw new TournamentError("members only");
    if (t.starts_at !== null) {
      // scheduled: entries until the start time, it starts then
      if (this.entries(id).length >= t.size) throw new TournamentError("tournament is full");
      this.addEntry(id, playerId);
      return this.changed(id)!;
    }
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

  /** Leaves or withdraws from every open or running tournament (profile deleted). */
  withdrawEverywhere(playerId: string): void {
    const ids = this.db
      .prepare(
        `SELECT t.id FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
         WHERE e.player_id = ? AND t.status IN ('open', 'running')`,
      )
      .all(playerId) as { id: string }[];
    for (const { id } of ids) this.leave(playerId, id);
  }

  private addEntry(id: string, playerId: string): void {
    this.db
      .prepare("INSERT INTO tournament_entries (tournament_id, player_id, joined_at) VALUES (?, ?, ?)")
      .run(id, playerId, new Date().toISOString());
  }

  /**
   * A scheduled tournament is due: entrants who meanwhile play another tournament drop out;
   * with enough players the field is cut to the entrants (knockout: the next bracket size, the
   * best seeds get byes), otherwise it is cancelled.
   */
  private startScheduled(id: string): void {
    const t = this.row(id)!;
    const remove = this.db.prepare(
      "DELETE FROM tournament_entries WHERE tournament_id = ? AND player_id = ?",
    );
    for (const e of this.entries(id)) {
      const other = this.activeTournamentOf(e.player_id);
      if (other && other !== id) remove.run(id, e.player_id);
    }
    const n = this.entries(id).length;
    if (n < TOURNAMENT_MIN_PLAYERS) {
      this.db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?").run(id);
      this.log(`tournament ${id} cancelled at its start time (${n} players)`);
      return;
    }
    let size = n;
    if (t.format === "knockout") {
      size = TOURNAMENT_MIN_PLAYERS;
      while (size < n) size *= 2;
    }
    this.db.prepare("UPDATE tournaments SET size = ? WHERE id = ?").run(size, id);
    this.start(id);
  }

  /** Seeds by rating (best first) and creates the first round. */
  private start(id: string): void {
    const t = this.row(id)!;
    const seeded = this.entries(id)
      .map((e) => ({
        id: e.player_id,
        rating: this.store.rating(e.player_id, t.variant, poolOf(t.clock)).rating,
      }))
      .sort((a, b) => b.rating - a.rating);
    const setSeed = this.db.prepare(
      "UPDATE tournament_entries SET seed = ? WHERE tournament_id = ? AND player_id = ?",
    );
    for (const [i, p] of seeded.entries()) setSeed.run(i + 1, id, p.id);
    this.db
      .prepare("UPDATE tournaments SET status = 'running', started_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    this.log(`tournament ${id} started`);
    if (t.format === "swiss") {
      this.pairSwissRound(id, 0);
      return;
    }
    const order = seedOrder(t.size);
    const insert = this.db.prepare(
      `INSERT INTO tournament_matches (tournament_id, round, slot, p0, p1, status, ready_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    /** First-round slots where a seed has no opponent (fewer entrants than the bracket). */
    const byes: [number, string][] = [];
    for (let r = 0; r < knockoutRounds(t.size); r++) {
      const slots = t.size >> (r + 1);
      for (let slot = 0; slot < slots; slot++) {
        if (r === 0) {
          const a = seeded[order[slot * 2]! - 1]?.id ?? null;
          const b = seeded[order[slot * 2 + 1]! - 1]?.id ?? null;
          insert.run(id, 0, slot, a, b, a && b ? "ready" : "waiting", a && b ? now : null);
          if (!a || !b) byes.push([slot, (a ?? b)!]);
        } else insert.run(id, r, slot, null, null, "waiting", null);
      }
    }
    for (const [slot, player] of byes) this.decide(id, 0, slot, player, true);
  }

  /** Pairs a Swiss round among the players who have not withdrawn. */
  private pairSwissRound(id: string, round: number): void {
    const entries = this.entries(id);
    const all = this.matches(id);
    const out = new Set(entries.filter((e) => e.withdrawn).map((e) => e.player_id));
    const ranked = this.standings(id, all)
      .map((r) => r.id)
      .filter((p) => !out.has(p));
    const met = (a: string, b: string) =>
      all.some((m) => (m.p0 === a && m.p1 === b) || (m.p0 === b && m.p1 === a));
    const hadBye = (p: string) => all.some((m) => m.p0 === p && m.p1 === null);
    const { pairs, bye } = swissPairs(ranked, met, hadBye);
    const insert = this.db.prepare(
      `INSERT INTO tournament_matches (tournament_id, round, slot, p0, p1, status, ready_at, winner, walkover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const [slot, [a, b]] of pairs.entries()) insert.run(id, round, slot, a, b, "ready", now, null, 0);
    if (bye) insert.run(id, round, pairs.length, bye, null, "done", null, bye, 1);
    this.log(`tournament ${id}: round ${round + 1} paired`);
    if (pairs.length === 0) this.afterSwissMatch(id, round);
  }

  /** Pairs the next Swiss round once the current one is complete, or ends the tournament. */
  private afterSwissMatch(id: string, round: number): void {
    const t = this.row(id)!;
    const pending = this.db
      .prepare("SELECT 1 FROM tournament_matches WHERE tournament_id = ? AND round = ? AND status != 'done'")
      .get(id, round);
    if (pending) return;
    const active = this.entries(id).filter((e) => !e.withdrawn).length;
    if (round + 1 < roundCount(t) && active >= 2) {
      this.pairSwissRound(id, round + 1);
      return;
    }
    const winner = this.standings(id)[0]?.id ?? null;
    this.finish(id, winner);
  }

  private finish(id: string, winner: string | null): void {
    this.db
      .prepare("UPDATE tournaments SET status = 'finished', finished_at = ?, winner = ? WHERE id = ?")
      .run(new Date().toISOString(), winner, id);
    this.log(`tournament ${id} won by ${winner}`);
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
    winner: string | null,
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
    if (t.format === "swiss") {
      this.afterSwissMatch(id, round);
      return;
    }
    if (round === knockoutRounds(t.size) - 1) {
      this.finish(id, winner);
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
   * absent or withdrawn players, cancel stale open tournaments, notify players of new matches.
   */
  tick(): void {
    const now = Date.now();
    const stale = this.db
      .prepare("SELECT id FROM tournaments WHERE status = 'open' AND starts_at IS NULL AND created_at < ?")
      .all(new Date(now - this.opts.openTtlMs).toISOString()) as { id: string }[];
    for (const { id } of stale) {
      this.db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?").run(id);
      this.changed(id);
    }
    const due = this.db
      .prepare(
        "SELECT id FROM tournaments WHERE status = 'open' AND starts_at IS NOT NULL AND starts_at <= ?",
      )
      .all(now) as { id: string }[];
    for (const { id } of due) {
      this.startScheduled(id);
      this.changed(id);
    }
    const ready = this.db
      .prepare(
        `SELECT m.tournament_id AS id, m.round, m.slot, m.p0, m.p1, m.ready_at, t.variant, t.length, t.name, t.size, t.format, t.clock
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
      format: TournamentFormat;
      clock: TimeControl;
    }[];
    for (const m of ready) {
      const ref: TournamentRef = {
        id: m.id,
        name: m.name,
        round: m.round,
        rounds: roundCount(m),
        format: m.format,
      };
      const key = `${m.id}/${m.round}/${m.slot}`;
      if (!this.announced.has(key)) {
        this.announced.add(key);
        const v = this.view(m.id);
        if (v) for (const p of [m.p0, m.p1]) this.host.matchReady?.(p, v, ref);
      }
      const withdrawn = new Set(
        this.entries(m.id)
          .filter((e) => e.withdrawn)
          .map((e) => e.player_id),
      );
      const out0 = withdrawn.has(m.p0);
      const out1 = withdrawn.has(m.p1);
      if (out0 || out1) {
        // Withdrawn players lose. If both withdrew, the better seed goes on as a formality in a
        // knockout; in Swiss nobody gets the win.
        const both = out0 && out1;
        const winner = both ? (m.format === "swiss" ? null : m.p0) : out0 ? m.p1 : m.p0;
        this.decide(m.id, m.round, m.slot, winner, true);
        this.changed(m.id);
        continue;
      }
      const a0 = this.host.isAvailable(m.p0);
      const a1 = this.host.isAvailable(m.p1);
      if (a0 && a1 && now - m.ready_at >= this.opts.startDelayMs) {
        const matchId = this.host.startTournamentMatch(m.variant, m.length, m.p0, m.p1, ref, m.slot, m.clock);
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
        this.decide(m.id, m.round, m.slot, m.format === "swiss" ? null : m.p0, true);
        this.changed(m.id);
      }
    }
  }

  /** Ready matches whose players have been notified (in memory: after a restart they are again). */
  private readonly announced = new Set<string>();

  /** Pushes the new state to all participants (and `extra` players) and returns it. */
  private changed(id: string, extra: readonly string[] = []): TournamentView | null {
    const v = this.view(id);
    if (!v) return null;
    for (const pid of new Set([...v.players.map((p) => p.id), ...extra])) this.host.push(pid, v);
    return v;
  }
}
