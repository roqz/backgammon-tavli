import { randomUUID } from "node:crypto";
import {
  type ClubRole,
  type ClubSummary,
  type ClubView,
  LEAGUE_DIVISION_MAX,
  LEAGUE_DIVISION_MIN,
  type LeagueMode,
  type LeagueStanding,
  type LeagueStatus,
  type LeagueSummary,
  type LeagueView,
  leagueMovers,
  type MatchVariantId,
  poolOf,
  SCHEDULE_MAX_AHEAD_MS,
  SCHEDULE_MIN_AHEAD_MS,
  type TimeControl,
  type TournamentView,
} from "@tavli/protocol";
import type { Store } from "./db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  open INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_name ON clubs(lower(name));
CREATE TABLE IF NOT EXISTS club_members (
  club_id TEXT NOT NULL REFERENCES clubs(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (club_id, player_id)
);
CREATE INDEX IF NOT EXISTS club_members_player ON club_members(player_id);
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  variant TEXT NOT NULL,
  length INTEGER NOT NULL,
  weeks INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ends_at INTEGER,
  winner TEXT,
  mode TEXT NOT NULL DEFAULT 'live',
  days INTEGER NOT NULL DEFAULT 0,
  divisions INTEGER NOT NULL DEFAULT 1,
  previous_id TEXT,
  clock TEXT NOT NULL DEFAULT 'relaxed',
  starts_at INTEGER
);
CREATE INDEX IF NOT EXISTS leagues_club ON leagues(club_id);
CREATE TABLE IF NOT EXISTS league_entries (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  division INTEGER,
  PRIMARY KEY (league_id, player_id)
);
CREATE TABLE IF NOT EXISTS league_matches (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  p0 TEXT NOT NULL,
  p1 TEXT NOT NULL,
  status TEXT NOT NULL,
  match_id TEXT,
  winner TEXT,
  score0 INTEGER,
  score1 INTEGER,
  played_at TEXT,
  PRIMARY KEY (league_id, p0, p1)
);
`;

/** Columns added after the first release of the tables. */
const MIGRATIONS: readonly [table: string, column: string, definition: string][] = [
  ["leagues", "mode", "TEXT NOT NULL DEFAULT 'live'"],
  ["leagues", "days", "INTEGER NOT NULL DEFAULT 0"],
  ["leagues", "divisions", "INTEGER NOT NULL DEFAULT 1"],
  ["leagues", "previous_id", "TEXT"],
  ["leagues", "clock", "TEXT NOT NULL DEFAULT 'relaxed'"],
  ["leagues", "starts_at", "INTEGER"],
  ["league_entries", "division", "INTEGER"],
];

export const MAX_CLUB_MEMBERS = 100;

/**
 * The public league: a club row that everyone belongs to (owned by a system player) holds one
 * season per month, run by the server: Backgammon, 1 point, correspondence with 24 hours per
 * move over four weeks. Entries until the 1st of the month; divisions of about 7 players are
 * cut at the start. Last season's players are entered again, except those who lost
 * NO_SHOW_LIMIT games on time.
 */
export const PUBLIC_CLUB = "public";
const SYSTEM_PLAYER = "system";
export const NO_SHOW_LIMIT = 2;
const PUBLIC_DIVISION_SIZE = 7;

/** Midnight UTC on the 1st of the month after `now`. */
export const nextMonthStart = (now: number): number => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/** Divisions for the public league: about 7 players each, at least 3. */
export const publicDivisions = (players: number): number =>
  Math.max(
    1,
    Math.min(Math.round(players / PUBLIC_DIVISION_SIZE), Math.floor(players / LEAGUE_DIVISION_MIN)),
  );
/** Clubs a player can belong to. */
export const MAX_CLUBS_PER_PLAYER = 10;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export class ClubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ClubRow {
  id: string;
  name: string;
  description: string;
  open: number;
  created_by: string;
  created_at: string;
}

interface LeagueRow {
  id: string;
  club_id: string;
  name: string;
  variant: MatchVariantId;
  length: number;
  weeks: number;
  status: LeagueStatus;
  created_at: string;
  started_at: string | null;
  ends_at: number | null;
  winner: string | null;
  mode: LeagueMode;
  days: number;
  divisions: number;
  previous_id: string | null;
  clock: TimeControl;
  starts_at: number | null;
}

interface EntryRow {
  player_id: string;
  division: number | null;
}

interface PairingRow {
  p0: string;
  p1: string;
  status: "pending" | "playing" | "done";
  match_id: string | null;
  winner: string | null;
  score0: number | null;
  score1: number | null;
}

type Standing = Omit<LeagueStanding, "division" | "move">;

/** League table: 2 points a win, then match point difference, then the direct comparison. */
export const leagueTable = (players: readonly string[], pairings: readonly PairingRow[]): Standing[] => {
  const s = new Map(players.map((p) => [p, { id: p, played: 0, wins: 0, losses: 0, points: 0, diff: 0 }]));
  for (const m of pairings) {
    if (m.status !== "done" || !m.winner) continue;
    const a = s.get(m.p0);
    const b = s.get(m.p1);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    const d = (m.score0 ?? 0) - (m.score1 ?? 0);
    a.diff += d;
    b.diff -= d;
    const [w, l] = m.winner === m.p0 ? [a, b] : [b, a];
    w.wins++;
    w.points += 2;
    l.losses++;
  }
  const direct = (x: string, y: string) => {
    const m = pairings.find(
      (p) => p.status === "done" && ((p.p0 === x && p.p1 === y) || (p.p0 === y && p.p1 === x)),
    );
    return m?.winner === x ? -1 : m?.winner === y ? 1 : 0;
  };
  return [...s.values()].sort((a, b) => b.points - a.points || b.diff - a.diff || direct(a.id, b.id));
};

/**
 * Seeding for a new season from the final tables of the previous one (top division first):
 * the bottom of each division swaps with the top of the one below. The result is one list,
 * best first, that is then cut into the new divisions.
 */
export const promotionOrder = (tables: readonly (readonly string[])[]): string[] => {
  const k = tables.map((t, d) => (d + 1 < tables.length ? leagueMovers(t.length, tables[d + 1]!.length) : 0));
  const up = (d: number) => (d > 0 && d < tables.length ? tables[d]!.slice(0, k[d - 1]) : []);
  const down = (d: number) => (d + 1 < tables.length ? tables[d]!.slice(tables[d]!.length - k[d]!) : []);
  return tables.flatMap((t, d) => {
    const moving = new Set([...up(d), ...down(d)]);
    return [...(d > 0 ? down(d - 1) : []), ...t.filter((p) => !moving.has(p)), ...up(d + 1)];
  });
};

/** Cuts a ranked list into `n` divisions (the upper ones take the remainder). */
export const cutDivisions = <T>(ranked: readonly T[], n: number): T[][] => {
  const base = Math.floor(ranked.length / n);
  const extra = ranked.length % n;
  const out: T[][] = [];
  let i = 0;
  for (let d = 0; d < n; d++) {
    const size = base + (d < extra ? 1 : 0);
    out.push(ranked.slice(i, i + size));
    i += size;
  }
  return out;
};

/** What the clubs need from the rest of the server. */
export interface ClubHost {
  presence(playerId: string, viewer: string): { presence: "offline" | "online" | "playing" };
  /** Club tournaments (members see them in the club). */
  clubTournaments?(clubId: string): TournamentView[];
  /** Starts a correspondence game of a league (p0 plays White) and returns its id. */
  startCorrGame?(
    leagueId: string,
    p0: string,
    p1: string,
    variant: MatchVariantId,
    length: number,
    days: number,
  ): string;
  /** Ends an unfinished correspondence game without a result (the season is over). */
  endCorrGame?(id: string): void;
}

/**
 * Clubs (open or by request; owner, admins, members) and their leagues: a season where every
 * entrant plays every other of the same division once — live via a challenge from the table, or
 * as correspondence games — within a number of weeks. With several divisions the next season
 * promotes the best of each division and relegates the worst.
 */
export class Clubs {
  constructor(
    private readonly store: Store,
    private readonly host: ClubHost,
    private readonly log: (msg: string) => void = () => {},
  ) {
    store.db.exec(SCHEMA);
    for (const [table, column, definition] of MIGRATIONS) {
      const cols = store.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column))
        store.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    const now = new Date().toISOString();
    store.db
      .prepare(
        "INSERT OR IGNORE INTO players (id, token_hash, name, created_at) VALUES (?, '-', 'System', ?)",
      )
      .run(SYSTEM_PLAYER, now);
    store.db
      .prepare(
        "INSERT OR IGNORE INTO clubs (id, name, description, open, created_by, created_at) VALUES (?, 'Public league', '', 1, ?, ?)",
      )
      .run(PUBLIC_CLUB, SYSTEM_PLAYER, now);
    // live rooms do not survive a restart: those league matches can be played again
    store.db
      .prepare(
        `UPDATE league_matches SET status = 'pending', match_id = NULL WHERE status = 'playing'
         AND league_id IN (SELECT id FROM leagues WHERE mode = 'live')`,
      )
      .run();
  }

  private get db() {
    return this.store.db;
  }

  private club(id: string): ClubRow {
    const row = this.db.prepare("SELECT * FROM clubs WHERE id = ?").get(id) as ClubRow | undefined;
    if (!row) throw new ClubError(404, "club not found");
    return row;
  }

  clubName(id: string): string | null {
    const r = this.db.prepare("SELECT name FROM clubs WHERE id = ?").get(id) as { name: string } | undefined;
    return r?.name ?? null;
  }

  roleOf(clubId: string, playerId: string): ClubRole | null {
    const r = this.db
      .prepare("SELECT role FROM club_members WHERE club_id = ? AND player_id = ?")
      .get(clubId, playerId) as { role: ClubRole } | undefined;
    return r?.role ?? null;
  }

  isMember(clubId: string, playerId: string): boolean {
    if (clubId === PUBLIC_CLUB) return true;
    const role = this.roleOf(clubId, playerId);
    return role !== null && role !== "pending";
  }

  isAdmin(clubId: string, playerId: string): boolean {
    const role = this.roleOf(clubId, playerId);
    return role === "owner" || role === "admin";
  }

  /** Clubs the player is a member of (not just asked to join). */
  memberClubIds(playerId: string): string[] {
    return (
      this.db
        .prepare("SELECT club_id FROM club_members WHERE player_id = ? AND role != 'pending'")
        .all(playerId) as { club_id: string }[]
    ).map((r) => r.club_id);
  }

  private requireAdmin(clubId: string, playerId: string): void {
    if (!this.isAdmin(clubId, playerId)) throw new ClubError(403, "only club admins can do that");
  }

  private memberCount(clubId: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND role != 'pending'")
        .get(clubId) as { n: number }
    ).n;
  }

  private summary(c: ClubRow, me: string): ClubSummary {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      open: c.open === 1,
      members: this.memberCount(c.id),
      myRole: this.roleOf(c.id, me),
    };
  }

  /** Clubs matching a search (or the player's own clubs without a query). */
  list(me: string, query: string): ClubSummary[] {
    const rows = query.trim()
      ? (this.db
          .prepare("SELECT * FROM clubs WHERE lower(name) LIKE ? AND id != 'public' ORDER BY name LIMIT 50")
          .all(`%${query.trim().toLowerCase().replace(/[%_]/g, "")}%`) as unknown as ClubRow[])
      : (this.db
          .prepare(
            "SELECT c.* FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE m.player_id = ? ORDER BY c.name",
          )
          .all(me) as unknown as ClubRow[]);
    return rows.map((c) => this.summary(c, me));
  }

  view(me: string, id: string): ClubView {
    const c = this.club(id);
    const role = this.roleOf(id, me);
    const member = role !== null && role !== "pending";
    const members = (
      this.db
        .prepare("SELECT player_id, role FROM club_members WHERE club_id = ? ORDER BY joined_at")
        .all(id) as { player_id: string; role: ClubRole }[]
    )
      // join requests are only shown to admins
      .filter((m) => m.role !== "pending" || role === "owner" || role === "admin")
      .map((m) => ({
        player: this.store.publicPlayer(m.player_id, "backgammon"),
        role: m.role,
        presence: member ? this.host.presence(m.player_id, me).presence : null,
      }));
    const leagues = (
      this.db
        .prepare("SELECT * FROM leagues WHERE club_id = ? ORDER BY created_at DESC LIMIT 20")
        .all(id) as unknown as LeagueRow[]
    ).map((l) => this.leagueSummary(l, me));
    return {
      ...this.summary(c, me),
      createdBy: c.created_by,
      memberList: members,
      leagues,
      tournaments: member ? (this.host.clubTournaments?.(id) ?? []) : [],
    };
  }

  create(me: string, name: string, description: string, open: boolean, guestAllowed: boolean): ClubView {
    if (!guestAllowed) throw new ClubError(403, "play a few matches or create an account first");
    if (this.clubsOf(me) >= MAX_CLUBS_PER_PLAYER) throw new ClubError(409, "too many clubs");
    if (this.db.prepare("SELECT 1 FROM clubs WHERE lower(name) = lower(?)").get(name))
      throw new ClubError(409, "club name taken");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO clubs (id, name, description, open, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, name, description, open ? 1 : 0, me, now);
    this.db
      .prepare("INSERT INTO club_members (club_id, player_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .run(id, me, now);
    this.log(`club ${id} created`);
    return this.view(me, id);
  }

  private clubsOf(me: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE player_id = ?").get(me) as { n: number }
    ).n;
  }

  /** Joins an open club, or asks to join a closed one. */
  join(me: string, id: string): ClubView {
    const c = this.club(id);
    if (this.roleOf(id, me)) return this.view(me, id);
    if (this.clubsOf(me) >= MAX_CLUBS_PER_PLAYER) throw new ClubError(409, "too many clubs");
    if (this.memberCount(id) >= MAX_CLUB_MEMBERS) throw new ClubError(409, "club is full");
    this.db
      .prepare("INSERT INTO club_members (club_id, player_id, role, joined_at) VALUES (?, ?, ?, ?)")
      .run(id, me, c.open ? "member" : "pending", new Date().toISOString());
    return this.view(me, id);
  }

  /** Leaves a club (an owner hands over to the longest-standing admin or member first). */
  leave(me: string, id: string): void {
    const role = this.roleOf(id, me);
    if (!role) return;
    this.db.prepare("DELETE FROM club_members WHERE club_id = ? AND player_id = ?").run(id, me);
    this.withdrawFromLeagues(id, me);
    if (role !== "owner") return;
    const next = this.db
      .prepare(
        `SELECT player_id FROM club_members WHERE club_id = ? AND role IN ('admin', 'member')
         ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1`,
      )
      .get(id) as { player_id: string } | undefined;
    if (next) this.setRole(id, next.player_id, "owner");
    else this.deleteClub(id);
  }

  /** Admins approve requests, promote members to admins, demote and remove them. */
  manage(
    me: string,
    id: string,
    playerId: string,
    action: "approve" | "remove" | "promote" | "demote",
  ): ClubView {
    this.requireAdmin(id, me);
    const role = this.roleOf(id, playerId);
    if (!role) throw new ClubError(404, "not a member");
    if (role === "owner") throw new ClubError(403, "the owner cannot be changed");
    if (action === "approve") {
      if (role !== "pending") return this.view(me, id);
      if (this.memberCount(id) >= MAX_CLUB_MEMBERS) throw new ClubError(409, "club is full");
      this.setRole(id, playerId, "member");
    } else if (action === "remove") {
      this.db.prepare("DELETE FROM club_members WHERE club_id = ? AND player_id = ?").run(id, playerId);
      this.withdrawFromLeagues(id, playerId);
    } else if (action === "promote") {
      if (this.roleOf(id, me) !== "owner") throw new ClubError(403, "only the owner can promote");
      if (role === "pending") throw new ClubError(400, "approve the request first");
      this.setRole(id, playerId, "admin");
    } else {
      if (this.roleOf(id, me) !== "owner") throw new ClubError(403, "only the owner can demote");
      this.setRole(id, playerId, "member");
    }
    return this.view(me, id);
  }

  private setRole(id: string, playerId: string, role: ClubRole): void {
    this.db
      .prepare("UPDATE club_members SET role = ? WHERE club_id = ? AND player_id = ?")
      .run(role, id, playerId);
  }

  private deleteClub(id: string): void {
    // correspondence games of running leagues end without a result
    const running = this.db
      .prepare(
        `SELECT m.match_id FROM league_matches m JOIN leagues l ON l.id = m.league_id
         WHERE l.club_id = ? AND l.mode = 'corr' AND m.status = 'playing' AND m.match_id IS NOT NULL`,
      )
      .all(id) as { match_id: string }[];
    for (const r of running) this.host.endCorrGame?.(r.match_id);
    for (const t of ["league_matches", "league_entries"])
      this.db
        .prepare(`DELETE FROM ${t} WHERE league_id IN (SELECT id FROM leagues WHERE club_id = ?)`)
        .run(id);
    this.db.prepare("DELETE FROM leagues WHERE club_id = ?").run(id);
    this.db.prepare("DELETE FROM club_members WHERE club_id = ?").run(id);
    this.db.prepare("DELETE FROM clubs WHERE id = ?").run(id);
    this.log(`club ${id} deleted`);
  }

  // ---- leagues ---------------------------------------------------------------------------------

  private league(id: string): LeagueRow {
    const row = this.db.prepare("SELECT * FROM leagues WHERE id = ?").get(id) as LeagueRow | undefined;
    if (!row) throw new ClubError(404, "league not found");
    return row;
  }

  leagueName(id: string): string | null {
    const r = this.db.prepare("SELECT name FROM leagues WHERE id = ?").get(id) as
      | { name: string }
      | undefined;
    return r?.name ?? null;
  }

  private entryRows(id: string): EntryRow[] {
    return this.db
      .prepare("SELECT player_id, division FROM league_entries WHERE league_id = ? ORDER BY rowid")
      .all(id) as unknown as EntryRow[];
  }

  private entries(id: string): string[] {
    return this.entryRows(id).map((r) => r.player_id);
  }

  private pairings(id: string): PairingRow[] {
    return this.db
      .prepare("SELECT * FROM league_matches WHERE league_id = ?")
      .all(id) as unknown as PairingRow[];
  }

  /** Final (or current) tables per division, top division first. */
  private divisionTables(l: LeagueRow): Standing[][] {
    const rows = this.entryRows(l.id);
    const pairings = this.pairings(l.id);
    return Array.from({ length: l.divisions }, (_, d) =>
      leagueTable(
        rows.filter((r) => (r.division ?? 1) === d + 1).map((r) => r.player_id),
        pairings,
      ),
    );
  }

  private nextOf(id: string): string | null {
    const r = this.db.prepare("SELECT id FROM leagues WHERE previous_id = ?").get(id) as
      | { id: string }
      | undefined;
    return r?.id ?? null;
  }

  private leagueSummary(l: LeagueRow, me: string): LeagueSummary {
    const rows = this.entryRows(l.id);
    const mine = rows.find((r) => r.player_id === me);
    return {
      id: l.id,
      clubId: l.club_id,
      name: l.name,
      variant: l.variant,
      length: l.length,
      weeks: l.weeks,
      status: l.status,
      mode: l.mode,
      days: l.days,
      clock: l.clock,
      startsAt: l.status === "open" ? l.starts_at : null,
      divisions: l.divisions,
      players: rows.length,
      entered: !!mine,
      myDivision: l.status === "open" ? null : (mine?.division ?? null),
      endsAt: l.ends_at,
      winner: l.winner ? this.store.publicPlayer(l.winner, l.variant, poolOf(l.clock)) : null,
      previousId: l.previous_id,
      nextId: this.nextOf(l.id),
    };
  }

  leagueView(me: string, id: string): LeagueView {
    const l = this.league(id);
    const rows = this.entryRows(id);
    const pairings = this.pairings(id);
    const player = (p: string) => this.store.publicPlayer(p, l.variant, poolOf(l.clock));
    const divisionOf = new Map(rows.map((r) => [r.player_id, r.division ?? 1]));
    const tables = l.status === "open" ? [] : this.divisionTables(l);
    const standings = tables.flatMap((table, d) => {
      const up = d > 0 ? leagueMovers(tables[d - 1]!.length, table.length) : 0;
      const down = d + 1 < tables.length ? leagueMovers(table.length, tables[d + 1]!.length) : 0;
      return table.map((s, i) => ({
        ...s,
        player: player(s.id),
        division: d + 1,
        move: i < up ? ("up" as const) : i >= table.length - down ? ("down" as const) : null,
      }));
    });
    return {
      ...this.leagueSummary(l, me),
      myRole: this.roleOf(l.club_id, me),
      entries: rows.map((r) => player(r.player_id)),
      standings,
      matches: pairings.map((m) => ({
        players: [player(m.p0), player(m.p1)],
        status: m.status,
        winner: m.winner,
        score: m.score0 === null || m.score1 === null ? null : [m.score0, m.score1],
        matchId: m.match_id,
        division: divisionOf.get(m.p0) ?? 1,
      })),
    };
  }

  createLeague(
    me: string,
    clubId: string,
    name: string,
    variant: MatchVariantId,
    length: number,
    weeks: number,
    mode: LeagueMode = "live",
    days = 3,
    divisions = 1,
    previousId: string | null = null,
    clock: TimeControl = "relaxed",
    startsAt: number | null = null,
  ): LeagueView {
    this.requireAdmin(clubId, me);
    if (startsAt !== null) {
      const ahead = startsAt - Date.now();
      if (ahead < SCHEDULE_MIN_AHEAD_MS || ahead > SCHEDULE_MAX_AHEAD_MS)
        throw new ClubError(400, "start time out of range");
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO leagues (id, club_id, name, variant, length, weeks, status, created_at, mode, days, divisions, previous_id, clock, starts_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        clubId,
        name,
        variant,
        length,
        weeks,
        new Date().toISOString(),
        mode,
        mode === "corr" ? days : 0,
        divisions,
        previousId,
        mode === "corr" ? "relaxed" : clock,
        startsAt,
      );
    return this.leagueView(me, id);
  }

  /**
   * The next season of a finished league: same settings, the previous entrants who are still
   * members are entered (they can leave before the start); divisions follow the final tables.
   */
  nextSeason(me: string, id: string): LeagueView {
    const l = this.league(id);
    this.requireAdmin(l.club_id, me);
    if (l.status !== "finished") throw new ClubError(409, "the season is not over yet");
    const existing = this.nextOf(id);
    if (existing) return this.leagueView(me, existing);
    const view = this.createLeague(
      me,
      l.club_id,
      nextSeasonName(l.name),
      l.variant,
      l.length,
      l.weeks,
      l.mode,
      l.days || 3,
      l.divisions,
      id,
      l.clock,
    );
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO league_entries (league_id, player_id) VALUES (?, ?)",
    );
    for (const p of this.entries(id)) if (this.isMember(l.club_id, p)) insert.run(view.id, p);
    return this.leagueView(me, view.id);
  }

  joinLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    if (!this.isMember(l.club_id, me)) throw new ClubError(403, "members only");
    if (l.status !== "open") throw new ClubError(409, "league already started");
    if (l.club_id !== PUBLIC_CLUB && this.entries(id).length >= LEAGUE_DIVISION_MAX * l.divisions)
      throw new ClubError(409, "league is full");
    this.db.prepare("INSERT OR IGNORE INTO league_entries (league_id, player_id) VALUES (?, ?)").run(id, me);
    return this.leagueView(me, id);
  }

  leaveLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    if (l.status !== "open") throw new ClubError(409, "league already started");
    this.db.prepare("DELETE FROM league_entries WHERE league_id = ? AND player_id = ?").run(id, me);
    return this.leagueView(me, id);
  }

  /**
   * Seeds the entrants into the divisions (by the previous season's tables with promotion and
   * relegation, newcomers by rating) and pairs everyone with everyone of the same division.
   * Correspondence leagues start all their games at once.
   */
  startLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    this.requireAdmin(l.club_id, me);
    if (l.status !== "open") throw new ClubError(409, "league already started");
    if (this.entries(id).length < LEAGUE_DIVISION_MIN * l.divisions)
      throw new ClubError(409, "a league needs at least 3 players per division");
    this.begin(l);
    return this.leagueView(me, id);
  }

  /** Seeds the divisions and creates every pairing (started by an admin or at the scheduled time). */
  private begin(l: LeagueRow): void {
    const id = l.id;
    const entries = this.entries(id);
    const groups = cutDivisions(this.seeding(l, entries), l.divisions);
    const setDivision = this.db.prepare(
      "UPDATE league_entries SET division = ? WHERE league_id = ? AND player_id = ?",
    );
    const insert = this.db.prepare(
      "INSERT INTO league_matches (league_id, p0, p1, status, match_id) VALUES (?, ?, ?, ?, ?)",
    );
    for (const [d, group] of groups.entries()) {
      for (const p of group) setDivision.run(d + 1, id, p);
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          // alternate who plays White
          const [a, b] = (i + j) % 2 === 0 ? [group[i]!, group[j]!] : [group[j]!, group[i]!];
          const corrId =
            l.mode === "corr"
              ? (this.host.startCorrGame?.(id, a, b, l.variant, l.length, l.days) ?? null)
              : null;
          insert.run(id, a, b, corrId ? "playing" : "pending", corrId);
        }
    }
    this.db
      .prepare("UPDATE leagues SET status = 'running', started_at = ?, ends_at = ? WHERE id = ?")
      .run(new Date().toISOString(), Date.now() + l.weeks * WEEK, id);
    this.log(`league ${id} started with ${entries.length} players in ${l.divisions} division(s)`);
  }

  /** Entrants best first: previous season's order (promotion/relegation applied), then by rating. */
  private seeding(l: LeagueRow, entries: readonly string[]): string[] {
    const rating = (p: string) => this.store.rating(p, l.variant, poolOf(l.clock)).rating;
    const byRating = (ps: readonly string[]) => [...ps].sort((a, b) => rating(b) - rating(a));
    const prev = l.previous_id
      ? (this.db.prepare("SELECT * FROM leagues WHERE id = ? AND status = 'finished'").get(l.previous_id) as
          | LeagueRow
          | undefined)
      : undefined;
    if (!prev) return byRating(entries);
    const wanted = new Set(entries);
    const ordered = promotionOrder(this.divisionTables(prev).map((t) => t.map((s) => s.id))).filter((p) =>
      wanted.has(p),
    );
    const known = new Set(ordered);
    return [...ordered, ...byRating(entries.filter((p) => !known.has(p)))];
  }

  /** The open live pairing of two players in a running league (for a league challenge). */
  pendingPairing(
    id: string,
    a: string,
    b: string,
  ): { variant: MatchVariantId; length: number; clock: TimeControl } | null {
    const l = this.db
      .prepare("SELECT * FROM leagues WHERE id = ? AND status = 'running' AND mode = 'live'")
      .get(id) as LeagueRow | undefined;
    if (!l) return null;
    const m = this.db
      .prepare(
        `SELECT 1 FROM league_matches WHERE league_id = ? AND status = 'pending'
         AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))`,
      )
      .get(id, a, b, b, a);
    return m ? { variant: l.variant, length: l.length, clock: l.clock } : null;
  }

  /** A league match started (it cannot be challenged twice). */
  matchStarted(id: string, a: string, b: string, matchId: string): void {
    this.db
      .prepare(
        `UPDATE league_matches SET status = 'playing', match_id = ? WHERE league_id = ?
         AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))`,
      )
      .run(matchId, id, a, b, b, a);
  }

  /** Result of a league match; finishes the league once every pairing is played. */
  matchEnded(
    id: string,
    players: readonly [string, string],
    winner: string,
    score: readonly [number, number],
  ): void {
    const row = this.db
      .prepare(
        `SELECT p0, p1 FROM league_matches WHERE league_id = ?1 AND status != 'done'
         AND ((p0 = ?2 AND p1 = ?3) OR (p0 = ?3 AND p1 = ?2))`,
      )
      .get(id, players[0], players[1]) as { p0: string; p1: string } | undefined;
    if (!row) return;
    const [s0, s1] = row.p0 === players[0] ? score : [score[1], score[0]];
    this.db
      .prepare(
        `UPDATE league_matches SET status = 'done', winner = ?, score0 = ?, score1 = ?, played_at = ?
         WHERE league_id = ? AND p0 = ? AND p1 = ?`,
      )
      .run(winner, s0, s1, new Date().toISOString(), id, row.p0, row.p1);
    const open = this.db
      .prepare("SELECT 1 FROM league_matches WHERE league_id = ? AND status != 'done'")
      .get(id);
    if (!open) this.finishLeague(id);
  }

  /** A league match was not finished (e.g. server restart): it can be played again. */
  matchAborted(id: string, a: string, b: string): void {
    this.db
      .prepare(
        `UPDATE league_matches SET status = 'pending', match_id = NULL WHERE league_id = ? AND status = 'playing'
         AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))`,
      )
      .run(id, a, b, b, a);
  }

  private finishLeague(id: string): void {
    const l = this.league(id);
    const top = this.divisionTables(l)[0] ?? [];
    const winner = top[0] && top[0].points > 0 ? top[0].id : null;
    this.db.prepare("UPDATE leagues SET status = 'finished', winner = ? WHERE id = ?").run(winner, id);
    this.log(`league ${id} finished, winner ${winner}`);
  }

  /** Periodic: seasons past their end are finished (unplayed pairings stay without points). */
  tick(now = Date.now()): void {
    // seasons end before new ones start (the next season seeds from the final tables)
    this.endDue(now);
    // scheduled starts: with too few players the league stays open (an admin can start it later)
    const starting = this.db
      .prepare("SELECT * FROM leagues WHERE status = 'open' AND starts_at IS NOT NULL AND starts_at <= ?")
      .all(now) as unknown as LeagueRow[];
    for (const l of starting) {
      if (l.club_id === PUBLIC_CLUB) {
        this.startPublic(l, now);
        continue;
      }
      this.db.prepare("UPDATE leagues SET starts_at = NULL WHERE id = ?").run(l.id);
      if (this.entries(l.id).length >= LEAGUE_DIVISION_MIN * l.divisions) this.begin(l);
      else this.log(`league ${l.id}: too few players at the scheduled start`);
    }
    this.ensurePublicSeason(now);
  }

  // ---- the public league -----------------------------------------------------------------------

  /** Players who lost at least NO_SHOW_LIMIT games of a season on time. */
  private noShows(leagueId: string): Set<string> {
    if (!this.store.tableExists("corr_games")) return new Set();
    const rows = this.db
      .prepare(
        `SELECT CASE WHEN winner = 0 THEN p1 ELSE p0 END AS loser, COUNT(*) AS n FROM corr_games
         WHERE league_id = ? AND reason = 'abandoned' GROUP BY loser HAVING n >= ?`,
      )
      .all(leagueId, NO_SHOW_LIMIT) as { loser: string }[];
    return new Set(rows.map((r) => r.loser));
  }

  /** There is always an open public season for next month (the previous players entered again). */
  private ensurePublicSeason(now: number): void {
    const open = this.db
      .prepare("SELECT 1 FROM leagues WHERE club_id = ? AND status = 'open'")
      .get(PUBLIC_CLUB);
    if (open) return;
    const last = this.db
      .prepare("SELECT * FROM leagues WHERE club_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(PUBLIC_CLUB) as LeagueRow | undefined;
    const start = nextMonthStart(now);
    const d = new Date(start);
    const name = `Backgammon ${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO leagues (id, club_id, name, variant, length, weeks, status, created_at, mode, days, divisions, previous_id, clock, starts_at)
         VALUES (?, ?, ?, 'backgammon', 1, 4, 'open', ?, 'corr', 1, 1, ?, 'relaxed', ?)`,
      )
      .run(id, PUBLIC_CLUB, name, new Date(now).toISOString(), last?.id ?? null, start);
    if (last) {
      const out = this.noShows(last.id);
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO league_entries (league_id, player_id) VALUES (?, ?)",
      );
      for (const p of this.entries(last.id)) if (!out.has(p)) insert.run(id, p);
    }
    this.log(`public league ${name} opened`);
  }

  /**
   * The public season starts: no-shows of the previous season sit out, divisions are cut by
   * the number of players. Too few players: it moves to the next month.
   */
  private startPublic(l: LeagueRow, now: number): void {
    if (l.previous_id) {
      const out = this.noShows(l.previous_id);
      const remove = this.db.prepare("DELETE FROM league_entries WHERE league_id = ? AND player_id = ?");
      for (const p of this.entries(l.id)) if (out.has(p)) remove.run(l.id, p);
    }
    const n = this.entries(l.id).length;
    if (n < LEAGUE_DIVISION_MIN) {
      this.db.prepare("UPDATE leagues SET starts_at = ? WHERE id = ?").run(nextMonthStart(now), l.id);
      this.log(`public league ${l.id}: ${n} players, moved to next month`);
      return;
    }
    const divisions = publicDivisions(n);
    this.db.prepare("UPDATE leagues SET starts_at = NULL, divisions = ? WHERE id = ?").run(divisions, l.id);
    this.begin({ ...l, divisions, starts_at: null });
  }

  /** The running public season and the open next one, from the view of `me`. */
  publicLeague(me: string, now = Date.now()): { current: LeagueSummary | null; next: LeagueSummary | null } {
    this.ensurePublicSeason(now);
    const row = (status: string) =>
      this.db
        .prepare("SELECT * FROM leagues WHERE club_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1")
        .get(PUBLIC_CLUB, status) as LeagueRow | undefined;
    const current = row("running");
    const next = row("open");
    return {
      current: current ? this.leagueSummary(current, me) : null,
      next: next ? this.leagueSummary(next, me) : null,
    };
  }

  /** Seasons whose time is up end (open correspondence games without a result). */
  private endDue(now: number): void {
    const due = this.db
      .prepare("SELECT * FROM leagues WHERE status = 'running' AND ends_at < ?")
      .all(now) as unknown as LeagueRow[];
    for (const l of due) {
      if (l.mode === "corr") {
        const open = this.db
          .prepare("SELECT match_id FROM league_matches WHERE league_id = ? AND status = 'playing'")
          .all(l.id) as { match_id: string | null }[];
        for (const r of open) if (r.match_id) this.host.endCorrGame?.(r.match_id);
      }
      this.db
        .prepare("UPDATE league_matches SET status = 'pending' WHERE league_id = ? AND status = 'playing'")
        .run(l.id);
      this.finishLeague(l.id);
    }
  }

  /** Leagues a player won (for the achievement). */
  leaguesWon(playerId: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM leagues WHERE winner = ?").get(playerId) as { n: number }
    ).n;
  }

  private withdrawFromLeagues(clubId: string, playerId: string): void {
    this.db
      .prepare(
        "DELETE FROM league_entries WHERE player_id = ? AND league_id IN (SELECT id FROM leagues WHERE club_id = ? AND status = 'open')",
      )
      .run(playerId, clubId);
  }
}

/** "Season 3" → "Season 4"; names without a number get " 2". */
export const nextSeasonName = (name: string): string => {
  const m = /^(.*?)(\d+)(\D*)$/.exec(name);
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3]}` : `${name} 2`.slice(0, 40);
};
