import { randomUUID } from "node:crypto";
import {
  applyMatchAction,
  createMatch,
  cryptoRng,
  IllegalActionError,
  type MatchAction,
  type MatchState,
  maxResultLevel,
  opponent,
  type Player,
  playerToAct,
  rollDice,
} from "@tavli/engine";
import type { ClientAction, CorrStatus, CorrView, MatchVariantId, ServerMessage } from "@tavli/protocol";
import type { Store, StoredGame } from "./db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS corr_games (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL,
  length INTEGER NOT NULL,
  days INTEGER NOT NULL,
  p0 TEXT NOT NULL REFERENCES players(id),
  p1 TEXT NOT NULL REFERENCES players(id),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL,
  state TEXT,
  games TEXT NOT NULL DEFAULT '[]',
  deadline INTEGER,
  winner INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  league_id TEXT
);
CREATE INDEX IF NOT EXISTS corr_p0 ON corr_games(p0, status);
CREATE INDEX IF NOT EXISTS corr_p1 ON corr_games(p1, status);
CREATE INDEX IF NOT EXISTS corr_deadline ON corr_games(status, deadline);
`;

const DAY = 24 * 60 * 60 * 1000;
/** Running and invited correspondence games per player. */
export const MAX_CORR_GAMES = 20;

export class CorrError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What the correspondence games need from the rest of the server. */
export interface CorrHost {
  /** Tells a connected player that a game changed. */
  notify(playerId: string, msg: ServerMessage): void;
  isConnected(playerId: string): boolean;
  /** Push notification "your move" for a player who is not connected. */
  yourMove?(playerId: string, game: CorrView): void;
  /** Result of a league game (forwarded to the league table). */
  leagueResult?(
    leagueId: string,
    players: readonly [string, string],
    winner: string,
    score: readonly [number, number],
  ): void;
  leagueName?(leagueId: string): string | null;
}

interface Row {
  id: string;
  variant: MatchVariantId;
  length: number;
  days: number;
  p0: string;
  p1: string;
  created_by: string;
  status: CorrStatus;
  state: string | null;
  games: string;
  deadline: number | null;
  winner: number | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  league_id: string | null;
}

/**
 * Correspondence games between friends: one decision at a time with days to answer instead of
 * minutes. The state lives in SQLite; dice are rolled by the server; a player who misses the
 * deadline loses. Finished games go to the normal match archive (unrated).
 */
export class Correspondence {
  constructor(
    private readonly store: Store,
    private readonly host: CorrHost,
    private readonly log: (msg: string) => void = () => {},
  ) {
    store.db.exec(SCHEMA);
    const cols = store.db.prepare("PRAGMA table_info(corr_games)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "league_id"))
      store.db.exec("ALTER TABLE corr_games ADD COLUMN league_id TEXT");
  }

  private get db() {
    return this.store.db;
  }

  private row(id: string): Row | undefined {
    return this.db.prepare("SELECT * FROM corr_games WHERE id = ?").get(id) as Row | undefined;
  }

  private view(r: Row, me: string): CorrView {
    const match = r.state ? (JSON.parse(r.state) as MatchState) : null;
    const actor = match && match.winner === null ? playerToAct(match.game) : null;
    return {
      id: r.id,
      variant: r.variant,
      length: r.length,
      days: r.days,
      players: [this.store.publicPlayer(r.p0, r.variant), this.store.publicPlayer(r.p1, r.variant)],
      createdBy: r.created_by,
      status: r.status,
      match,
      seat: r.p0 === me ? 0 : r.p1 === me ? 1 : null,
      toAct: actor,
      deadline: r.deadline,
      winner: r.winner === null ? null : (r.winner as Player),
      reason: r.reason,
      updatedAt: r.updated_at,
      league: r.league_id ? { id: r.league_id, name: this.host.leagueName?.(r.league_id) ?? "?" } : null,
    };
  }

  /** The player's invitations, running and recently finished games. */
  list(me: string): CorrView[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM corr_games WHERE (p0 = ?1 OR p1 = ?1)
         AND (status IN ('invited', 'active') OR updated_at > ?2) ORDER BY updated_at DESC LIMIT 100`,
      )
      .all(me, new Date(Date.now() - 14 * DAY).toISOString()) as unknown as Row[];
    return rows.map((r) => this.view(r, me));
  }

  get(me: string, id: string): CorrView {
    const r = this.row(id);
    if (!r || (r.p0 !== me && r.p1 !== me)) throw new CorrError(404, "not found");
    return this.view(r, me);
  }

  /** A friend is invited; the inviter plays White. */
  invite(me: string, friend: string, variant: MatchVariantId, length: number, days: number): CorrView {
    if (!this.store.areFriends(me, friend)) throw new CorrError(403, "not friends");
    const open = (id: string) =>
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM corr_games WHERE (p0 = ?1 OR p1 = ?1) AND status IN ('invited', 'active')",
          )
          .get(id) as { n: number }
      ).n;
    if (open(me) >= MAX_CORR_GAMES || open(friend) >= MAX_CORR_GAMES)
      throw new CorrError(409, "too many games");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO corr_games (id, variant, length, days, p0, p1, created_by, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      )
      .run(id, variant, length, days, me, friend, me, now, now);
    this.changed(id);
    return this.get(me, id);
  }

  /**
   * A game of a correspondence league: starts right away (no invitation, no friendship needed,
   * not counted against the limit of open games).
   */
  startLeagueGame(
    leagueId: string,
    p0: string,
    p1: string,
    variant: MatchVariantId,
    length: number,
    days: number,
  ): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    const m = this.autoSteps(createMatch({ variant, length, crawford: true, jacoby: length === 0 }));
    this.db
      .prepare(
        `INSERT INTO corr_games (id, variant, length, days, p0, p1, created_by, status, state, deadline, created_at, updated_at, league_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        variant,
        length,
        days,
        p0,
        p1,
        p0,
        JSON.stringify(m),
        Date.now() + days * DAY,
        now,
        now,
        leagueId,
      );
    this.changed(id, true);
    return id;
  }

  /** Ends a running game without a result (its league season is over). */
  endWithoutResult(id: string): void {
    const r = this.row(id);
    if (r?.status !== "active") return;
    this.update(id, { status: "finished", reason: "ended", deadline: null });
    this.log(`correspondence ${id} ended without a result`);
    this.changed(id);
  }

  /** The invited player accepts (the game starts) or declines. */
  answer(me: string, id: string, accept: boolean): CorrView {
    const r = this.row(id);
    if (!r || r.p1 !== me || r.status !== "invited") throw new CorrError(404, "invitation not found");
    if (!accept) {
      this.update(id, { status: "declined" });
      this.changed(id);
      return this.get(me, id);
    }
    let m = createMatch({ variant: r.variant, length: r.length, crawford: true, jacoby: r.length === 0 });
    m = this.autoSteps(m);
    this.update(id, { status: "active", state: JSON.stringify(m), deadline: Date.now() + r.days * DAY });
    this.log(`correspondence ${id} started`);
    this.changed(id, true);
    return this.get(me, id);
  }

  /** Withdraws an own invitation or resigns a running game. */
  abandon(me: string, id: string): CorrView {
    const r = this.row(id);
    if (!r || (r.p0 !== me && r.p1 !== me)) throw new CorrError(404, "not found");
    if (r.status === "invited") this.update(id, { status: "declined" });
    else if (r.status === "active") this.finish(r, r.p0 === me ? 1 : 0, "forfeit");
    this.changed(id);
    return this.get(me, id);
  }

  /** One decision of the player to act (roll, a single move, undo, confirm, cube, resign). */
  act(me: string, id: string, action: ClientAction): CorrView {
    const r = this.row(id);
    if (!r || (r.p0 !== me && r.p1 !== me)) throw new CorrError(404, "not found");
    if (r.status !== "active" || !r.state) throw new CorrError(409, "game is not running");
    const seat: Player = r.p0 === me ? 0 : 1;
    let m = JSON.parse(r.state) as MatchState;
    const actorBefore = playerToAct(m.game);
    let matchAction: MatchAction;
    if (action.type === "resign") {
      matchAction = { type: "resign", player: seat, level: maxResultLevel(m.game, opponent(seat)) };
    } else {
      if (actorBefore !== seat) throw new CorrError(409, "not your turn");
      if (
        action.type === "offer-resign" ||
        action.type === "accept-resign" ||
        action.type === "reject-resign"
      )
        throw new CorrError(400, "not available in correspondence games");
      matchAction = action.type === "roll" ? { type: "roll", dice: rollDice(cryptoRng) } : action;
    }
    const gamesBefore = m.results.length;
    try {
      m = applyMatchAction(m, matchAction);
    } catch (e) {
      if (e instanceof IllegalActionError) throw new CorrError(400, e.message);
      throw e;
    }
    const games = JSON.parse(r.games) as StoredGame[];
    if (m.game.result)
      games.push({ variant: m.game.variant, history: m.game.history, result: m.game.result });
    m = this.autoSteps(m);
    const actorAfter = m.winner === null ? playerToAct(m.game) : null;
    const newDecision = actorAfter !== actorBefore || m.results.length !== gamesBefore;
    this.update(id, {
      state: JSON.stringify(m),
      games: JSON.stringify(games),
      ...(newDecision ? { deadline: Date.now() + r.days * DAY } : {}),
    });
    if (m.winner !== null) this.finish({ ...this.row(id)! }, m.winner, "won");
    this.changed(id, newDecision);
    return this.get(me, id);
  }

  /** Server steps: the next game of a match and the opening roll (re-rolling ties). */
  private autoSteps(start: MatchState): MatchState {
    let m = start;
    if (m.winner === null && m.game.result) m = applyMatchAction(m, { type: "next-game" });
    while (m.winner === null && m.game.phase === "opening")
      m = applyMatchAction(m, { type: "roll", dice: rollDice(cryptoRng) });
    return m;
  }

  private finish(r: Row, winner: Player, reason: "won" | "forfeit" | "abandoned"): void {
    const m = r.state ? (JSON.parse(r.state) as MatchState) : null;
    this.update(r.id, { status: "finished", winner, reason, deadline: null });
    try {
      const games = JSON.parse(this.row(r.id)!.games) as StoredGame[];
      if (m && m.game.result === null && m.game.history.length > 0)
        games.push({ variant: m.game.variant, history: m.game.history });
      this.store.saveMatch({
        id: r.id,
        variant: r.variant,
        length: r.length,
        players: [r.p0, r.p1],
        winner,
        score: m?.score ?? [0, 0],
        reason,
        games,
        startedAt: r.created_at,
        rated: false,
      });
    } catch (e) {
      this.log(`archiving correspondence ${r.id} failed: ${String(e)}`);
    }
    if (r.league_id) {
      try {
        this.host.leagueResult?.(r.league_id, [r.p0, r.p1], winner === 0 ? r.p0 : r.p1, m?.score ?? [0, 0]);
      } catch (e) {
        this.log(`league update after correspondence ${r.id} failed: ${String(e)}`);
      }
    }
  }

  /** Periodic: players who missed their deadline lose. */
  tick(now = Date.now()): void {
    const late = this.db
      .prepare("SELECT * FROM corr_games WHERE status = 'active' AND deadline IS NOT NULL AND deadline < ?")
      .all(now) as unknown as Row[];
    for (const r of late) {
      const m = JSON.parse(r.state!) as MatchState;
      const actor = playerToAct(m.game) ?? m.game.turn;
      this.finish(r, opponent(actor), "abandoned");
      this.log(`correspondence ${r.id}: deadline missed by seat ${actor}`);
      this.changed(r.id);
    }
  }

  private update(
    id: string,
    patch: Partial<Pick<Row, "status" | "state" | "games" | "deadline" | "winner" | "reason">>,
  ) {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    const sets = [...keys.map((k) => `${k} = ?`), "updated_at = ?"].join(", ");
    this.db
      .prepare(`UPDATE corr_games SET ${sets} WHERE id = ?`)
      .run(...keys.map((k) => patch[k] ?? null), new Date().toISOString(), id);
  }

  /** Tells both players; the one who has to act gets a push when not connected. */
  private changed(id: string, newDecision = false): void {
    const r = this.row(id)!;
    for (const p of [r.p0, r.p1]) this.host.notify(p, { t: "corr-changed", id });
    if (!newDecision || r.status !== "active") return;
    const view = this.view(r, r.p0);
    if (view.toAct === null) return;
    const actorId = view.toAct === 0 ? r.p0 : r.p1;
    if (!this.host.isConnected(actorId)) this.host.yourMove?.(actorId, view);
  }
}
