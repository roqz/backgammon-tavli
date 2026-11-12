import { randomUUID } from "node:crypto";
import type {
  ClubRole,
  ClubSummary,
  ClubView,
  LeagueStanding,
  LeagueStatus,
  LeagueSummary,
  LeagueView,
  MatchVariantId,
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
  winner TEXT
);
CREATE INDEX IF NOT EXISTS leagues_club ON leagues(club_id);
CREATE TABLE IF NOT EXISTS league_entries (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  player_id TEXT NOT NULL REFERENCES players(id),
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

export const MAX_CLUB_MEMBERS = 100;
/** Clubs a player can belong to. */
export const MAX_CLUBS_PER_PLAYER = 10;
export const MAX_LEAGUE_PLAYERS = 16;
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

/** League table: 2 points a win, then match point difference, then the direct comparison. */
export const leagueTable = (
  players: readonly string[],
  pairings: readonly PairingRow[],
): LeagueStanding[] => {
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

/** What the clubs need from the lobby. */
export interface ClubHost {
  presence(playerId: string, viewer: string): { presence: "offline" | "online" | "playing" };
}

/**
 * Clubs (open or by request; owner, admins, members) and their leagues: a season where every
 * entrant plays every other once, live via a challenge from the table, within a number of weeks.
 */
export class Clubs {
  constructor(
    private readonly store: Store,
    private readonly host: ClubHost,
    private readonly log: (msg: string) => void = () => {},
  ) {
    store.db.exec(SCHEMA);
    // rooms do not survive a restart: those league matches can be played again
    store.db
      .prepare("UPDATE league_matches SET status = 'pending', match_id = NULL WHERE status = 'playing'")
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

  roleOf(clubId: string, playerId: string): ClubRole | null {
    const r = this.db
      .prepare("SELECT role FROM club_members WHERE club_id = ? AND player_id = ?")
      .get(clubId, playerId) as { role: ClubRole } | undefined;
    return r?.role ?? null;
  }

  private requireAdmin(clubId: string, playerId: string): void {
    const role = this.roleOf(clubId, playerId);
    if (role !== "owner" && role !== "admin") throw new ClubError(403, "only club admins can do that");
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
          .prepare("SELECT * FROM clubs WHERE lower(name) LIKE ? ORDER BY name LIMIT 50")
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
        presence: role && role !== "pending" ? this.host.presence(m.player_id, me).presence : null,
      }));
    const leagues = (
      this.db
        .prepare("SELECT * FROM leagues WHERE club_id = ? ORDER BY created_at DESC LIMIT 20")
        .all(id) as unknown as LeagueRow[]
    ).map((l) => this.leagueSummary(l, me));
    return { ...this.summary(c, me), createdBy: c.created_by, memberList: members, leagues };
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

  private entries(id: string): string[] {
    return (
      this.db.prepare("SELECT player_id FROM league_entries WHERE league_id = ?").all(id) as {
        player_id: string;
      }[]
    ).map((r) => r.player_id);
  }

  private pairings(id: string): PairingRow[] {
    return this.db
      .prepare("SELECT * FROM league_matches WHERE league_id = ?")
      .all(id) as unknown as PairingRow[];
  }

  private leagueSummary(l: LeagueRow, me: string): LeagueSummary {
    const entries = this.entries(l.id);
    return {
      id: l.id,
      clubId: l.club_id,
      name: l.name,
      variant: l.variant,
      length: l.length,
      weeks: l.weeks,
      status: l.status,
      players: entries.length,
      entered: entries.includes(me),
      endsAt: l.ends_at,
      winner: l.winner ? this.store.publicPlayer(l.winner, l.variant) : null,
    };
  }

  leagueView(me: string, id: string): LeagueView {
    const l = this.league(id);
    const entries = this.entries(id);
    const pairings = this.pairings(id);
    const player = (p: string) => this.store.publicPlayer(p, l.variant);
    return {
      ...this.leagueSummary(l, me),
      myRole: this.roleOf(l.club_id, me),
      entries: entries.map(player),
      standings: leagueTable(entries, pairings).map((s) => ({ ...s, player: player(s.id) })),
      matches: pairings.map((m) => ({
        players: [player(m.p0), player(m.p1)],
        status: m.status,
        winner: m.winner,
        score: m.score0 === null || m.score1 === null ? null : [m.score0, m.score1],
        matchId: m.match_id,
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
  ): LeagueView {
    this.requireAdmin(clubId, me);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO leagues (id, club_id, name, variant, length, weeks, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(id, clubId, name, variant, length, weeks, new Date().toISOString());
    return this.leagueView(me, id);
  }

  joinLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    const role = this.roleOf(l.club_id, me);
    if (!role || role === "pending") throw new ClubError(403, "members only");
    if (l.status !== "open") throw new ClubError(409, "league already started");
    if (this.entries(id).length >= MAX_LEAGUE_PLAYERS) throw new ClubError(409, "league is full");
    this.db.prepare("INSERT OR IGNORE INTO league_entries (league_id, player_id) VALUES (?, ?)").run(id, me);
    return this.leagueView(me, id);
  }

  leaveLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    if (l.status !== "open") throw new ClubError(409, "league already started");
    this.db.prepare("DELETE FROM league_entries WHERE league_id = ? AND player_id = ?").run(id, me);
    return this.leagueView(me, id);
  }

  /** Every pairing of the entrants once; the season runs for the chosen weeks. */
  startLeague(me: string, id: string): LeagueView {
    const l = this.league(id);
    this.requireAdmin(l.club_id, me);
    if (l.status !== "open") throw new ClubError(409, "league already started");
    const entries = this.entries(id);
    if (entries.length < 3) throw new ClubError(409, "a league needs at least 3 players");
    const insert = this.db.prepare(
      "INSERT INTO league_matches (league_id, p0, p1, status) VALUES (?, ?, ?, 'pending')",
    );
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) insert.run(id, entries[i]!, entries[j]!);
    this.db
      .prepare("UPDATE leagues SET status = 'running', started_at = ?, ends_at = ? WHERE id = ?")
      .run(new Date().toISOString(), Date.now() + l.weeks * WEEK, id);
    this.log(`league ${id} started with ${entries.length} players`);
    return this.leagueView(me, id);
  }

  /** The open pairing of two players in a running league (for a league challenge). */
  pendingPairing(id: string, a: string, b: string): { variant: MatchVariantId; length: number } | null {
    const l = this.db.prepare("SELECT * FROM leagues WHERE id = ? AND status = 'running'").get(id) as
      | LeagueRow
      | undefined;
    if (!l) return null;
    const m = this.db
      .prepare(
        `SELECT 1 FROM league_matches WHERE league_id = ? AND status = 'pending'
         AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))`,
      )
      .get(id, a, b, b, a);
    return m ? { variant: l.variant, length: l.length } : null;
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
        "SELECT p0, p1 FROM league_matches WHERE league_id = ? AND ((p0 = ?2 AND p1 = ?3) OR (p0 = ?3 AND p1 = ?2))",
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
    const table = leagueTable(this.entries(id), this.pairings(id));
    const winner = table[0] && table[0].points > 0 ? table[0].id : null;
    this.db.prepare("UPDATE leagues SET status = 'finished', winner = ? WHERE id = ?").run(winner, id);
    this.log(`league ${id} finished, winner ${winner}`);
  }

  /** Periodic: seasons past their end are finished (unplayed pairings stay without points). */
  tick(now = Date.now()): void {
    const due = this.db
      .prepare("SELECT id FROM leagues WHERE status = 'running' AND ends_at < ?")
      .all(now) as { id: string }[];
    for (const { id } of due) {
      this.db
        .prepare("UPDATE league_matches SET status = 'pending' WHERE league_id = ? AND status = 'playing'")
        .run(id);
      this.finishLeague(id);
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
