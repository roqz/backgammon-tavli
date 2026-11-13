import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { chooseMoves, type MatchContext, shouldAcceptResign, shouldTake } from "@tavli/ai";
import {
  applyMatchAction,
  canConfirm,
  createMatch,
  cryptoRng,
  type Dice,
  IllegalActionError,
  isClosedOut,
  type MatchAction,
  type MatchConfig,
  type MatchState,
  maxResultLevel,
  opponent,
  type Player,
  playerToAct,
  type Rng,
  turnOptions,
} from "@tavli/engine";
import {
  CLOCK_SPECS,
  type ClientAction,
  type ClockView,
  clockReserveMs,
  diceFromDigest,
  type EmoteId,
  type FairnessReveal,
  fairRollMessage,
  type MatchEndReason,
  type MatchVariantId,
  type PublicPlayer,
  poolOf,
  type ServerMessage,
  type TimeControl,
  type TournamentRef,
  type UnratedReason,
} from "@tavli/protocol";
import type { FinishedMatch, StoredGame, TimingStats } from "./db";

export interface Conn {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

export interface RoomTimings {
  /** Time to roll or move. */
  readonly turnMs: number;
  /** Time to answer a double. */
  readonly cubeMs: number;
  /** How long a disconnected player may take to come back. */
  readonly graceMs: number;
  /** Pause between the games of a match. */
  readonly nextGameMs: number;
  /** After this many consecutive timeouts the player forfeits. */
  readonly maxTimeouts: number;
  /** How long to wait for the clients' dice seeds before playing without them. */
  readonly seedWaitMs: number;
}

export interface Seat {
  readonly player: PublicPlayer;
  conn: Conn | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  graceUntil: number | null;
  timeouts: number;
}

export interface RoomDeps {
  readonly timings: RoomTimings;
  readonly rng?: Rng;
  /** Persists the match and returns rating deltas per seat. */
  readonly onEnd: (room: MatchRoom, result: FinishedMatch) => [number, number];
  readonly log?: (msg: string) => void;
  /** Whether the match may change ratings at all (fair-play checks done by the lobby). */
  readonly rating?: { readonly rated: boolean; readonly reason: UnratedReason | null };
  /** Set for tournament matches (shown to the players). */
  readonly tournament?: TournamentRef;
  /** Public matches can be watched by anybody (queue, tournaments); private ones by friends. */
  readonly watchable?: boolean;
  /** Spectators see every change this much later (against live advice to a player). */
  readonly spectatorDelayMs?: number;
  /** Chess clock (standard, blitz); without it the relaxed per-decision time applies. */
  readonly timeControl?: TimeControl;
}

/** Spectators per match. */
export const MAX_SPECTATORS = 50;

/**
 * One online match between two players. The server is authoritative: it rolls the dice,
 * validates every action with the engine and broadcasts the resulting state.
 */
export class MatchRoom {
  readonly id = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly seats: [Seat, Seat];
  match: MatchState;
  ended = false;
  private deadline: number | null = null;
  private clock: ReturnType<typeof setTimeout> | null = null;
  private nextGameTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly games: StoredGame[] = [];
  private moved = false;
  private readonly rng: Rng;
  /** Provably fair dice: secret seed, its public commitment, the clients' seeds and all rolls. */
  private readonly serverSeed = randomBytes(32);
  readonly commit = createHash("sha256").update(this.serverSeed).digest("hex");
  private readonly clientSeeds: [string | null, string | null] = [null, null];
  private readonly rolls: Dice[] = [];
  private playing = false;
  private seedTimer: ReturnType<typeof setTimeout> | null = null;
  /** History length when each seat last offered to resign: one offer per turn (no clock resets). */
  private readonly lastOffer: [number, number] = [-1, -1];
  private readonly lastEmote: [number, number] = [0, 0];
  private readonly spectators = new Set<Conn>();
  /** What spectators saw at which time, kept as long as the delay needs it. */
  private snapshots: { at: number; msg: Extract<ServerMessage, { t: "watch-state" }> }[] = [];
  private readonly delayTimers = new Set<ReturnType<typeof setTimeout>>();
  private lastState: { action: MatchAction | null; by: Player | null; opening: Dice | null } = {
    action: null,
    by: null,
    opening: null,
  };
  /** The checker-play decision running now: whose, since when, and whether there was a choice. */
  private turnClock: { seat: Player; since: number; choice: boolean; key: number } | null = null;
  /** Chess clock: reserve per seat and the decision that runs now. */
  private readonly reserve: [number, number] = [0, 0];
  private decision: { seat: Player; start: number; key: string; free: boolean; checked: boolean } | null =
    null;
  /** Think times of decisions with a real choice (fair-play signal). */
  private readonly timing: [TimingStats, TimingStats] = [
    { n: 0, sumLog: 0, sumLog2: 0 },
    { n: 0, sumLog: 0, sumLog2: 0 },
  ];

  constructor(
    readonly variant: MatchVariantId,
    readonly config: MatchConfig,
    players: readonly [PublicPlayer, PublicPlayer],
    private readonly deps: RoomDeps,
  ) {
    this.rng = deps.rng ?? cryptoRng;
    const seat = (player: PublicPlayer): Seat => ({
      player,
      conn: null,
      graceTimer: null,
      graceUntil: null,
      timeouts: 0,
    });
    this.seats = [seat(players[0]), seat(players[1])];
    this.match = createMatch(config);
    const tc = deps.timeControl;
    if (tc && tc !== "relaxed") this.reserve.fill(clockReserveMs(tc, config.length));
  }

  seatOf(playerId: string): Player | null {
    if (this.seats[0].player.id === playerId) return 0;
    if (this.seats[1].player.id === playerId) return 1;
    return null;
  }

  /** Called once both players are connected: publish the commitment, then wait for the client seeds. */
  start(): void {
    for (const s of [0, 1] as Player[]) this.sendStart(s);
    this.seedTimer = setTimeout(() => this.beginPlay(), this.deps.timings.seedWaitMs);
  }

  /** A client's contribution to the dice randomness (accepted once, before the first roll). */
  seed(seat: Player, value: string): void {
    if (this.playing || this.clientSeeds[seat] !== null) return;
    this.clientSeeds[seat] = value;
    if (this.clientSeeds[0] !== null && this.clientSeeds[1] !== null) this.beginPlay();
  }

  private beginPlay(): void {
    if (this.playing || this.ended) return;
    if (this.seedTimer) clearTimeout(this.seedTimer);
    this.seedTimer = null;
    this.playing = true;
    this.advance(null, null);
  }

  private seeds(): [string, string] {
    return [this.clientSeeds[0] ?? "", this.clientSeeds[1] ?? ""];
  }

  /** Next roll, derived from the committed server seed and both client seeds. */
  private roll(): Dice {
    const index = this.rolls.length;
    let dice: [number, number] | null = null;
    for (let extra = ""; !dice; extra += "+") {
      const digest = createHmac("sha256", this.serverSeed)
        .update(fairRollMessage(this.seeds(), index, extra))
        .digest();
      dice = diceFromDigest(digest);
    }
    this.rolls.push(dice);
    return dice;
  }

  fairnessReveal(): FairnessReveal {
    return {
      commit: this.commit,
      serverSeed: this.serverSeed.toString("hex"),
      clientSeeds: this.seeds(),
      rolls: this.rolls,
    };
  }

  // ---- connections ---------------------------------------------------------------------------

  attach(seat: Player, conn: Conn): void {
    const s = this.seats[seat];
    if (s.graceTimer) clearTimeout(s.graceTimer);
    s.graceTimer = null;
    s.graceUntil = null;
    s.conn = conn;
  }

  /** A player came back after a disconnect: resend everything they need. */
  reconnect(seat: Player, conn: Conn): void {
    this.attach(seat, conn);
    this.sendStart(seat);
    conn.send(this.stateMessage(null, null, null));
    this.sendTo(opponent(seat), { t: "opponent", connected: true, graceUntil: null });
    const opp = this.seats[opponent(seat)];
    if (!opp.conn) conn.send({ t: "opponent", connected: false, graceUntil: opp.graceUntil });
  }

  disconnect(seat: Player): void {
    const s = this.seats[seat];
    s.conn = null;
    if (this.ended) return;
    s.graceUntil = Date.now() + this.deps.timings.graceMs;
    this.sendTo(opponent(seat), { t: "opponent", connected: false, graceUntil: s.graceUntil });
    s.graceTimer = setTimeout(() => this.forfeit(seat, "abandoned"), this.deps.timings.graceMs);
  }

  /** The player leaves on purpose: forfeits a running match. */
  leave(seat: Player): void {
    if (this.ended) return;
    if (this.config.length === 0) return this.endSession(seat);
    this.forfeit(seat, "forfeit");
  }

  /**
   * A player ends a money session. Between games that is a normal end; during a game the
   * leaver first concedes it at the highest result still possible. The score decides (a tie
   * goes to the player who stayed).
   */
  private endSession(by: Player): void {
    const g = this.match.game;
    if (g.result === null && g.history.length > 0) {
      try {
        this.advance({ type: "resign", player: by, level: maxResultLevel(g, opponent(by)) }, by);
      } catch {
        // the game state does not allow it (e.g. not started yet): the score stays
      }
      if (this.ended) return;
    }
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer);
    const [s0, s1] = this.match.score;
    const winner: Player = s0 === s1 ? opponent(by) : s0 > s1 ? 0 : 1;
    this.match = { ...this.match, winner };
    this.finish("ended");
  }

  // ---- actions -------------------------------------------------------------------------------

  handle(seat: Player, action: ClientAction): void {
    if (this.ended) return this.sendTo(seat, { t: "error", message: "match is over" });
    let matchAction: MatchAction;
    if (action.type === "resign") {
      // Resigning without the opponent's consent always concedes the highest possible result;
      // smaller results need an accepted offer.
      const g = this.match.game;
      const level =
        g.phase === "finished" ? action.level : Math.max(action.level, maxResultLevel(g, opponent(seat)));
      matchAction = { type: "resign", player: seat, level: level as 1 | 2 | 3 };
    } else {
      if (playerToAct(this.match.game) !== seat)
        return this.sendTo(seat, { t: "error", message: "not your turn" });
      if (action.type === "offer-resign") {
        const turnKey = this.match.results.length * 10_000 + this.match.game.history.length;
        if (this.lastOffer[seat] === turnKey)
          return this.sendTo(seat, { t: "error", message: "only one offer per turn" });
        this.lastOffer[seat] = turnKey;
        matchAction = { type: "offer-resign", player: seat, level: action.level };
      } else matchAction = action.type === "roll" ? { type: "roll", dice: this.roll() } : action;
    }
    try {
      this.seats[seat].timeouts = 0;
      const clock = this.turnClock;
      this.advance(matchAction, seat);
      if (matchAction.type === "confirm" && clock?.seat === seat && clock.choice)
        this.recordThinkTime(seat, Date.now() - clock.since);
    } catch (e) {
      if (e instanceof IllegalActionError) this.sendTo(seat, { t: "error", message: e.message });
      else throw e;
    }
  }

  /** Applies an action, runs server-side steps (opening roll, next game) and broadcasts. */
  private advance(action: MatchAction | null, by: Player | null): void {
    const before = this.match;
    if (action) {
      this.match = applyMatchAction(this.match, action);
      if (action.type === "move") this.moved = true;
    }
    let opening: Dice | null = null;
    // The server rolls the opening dice itself (re-rolling ties).
    if (this.match.game.phase === "opening") {
      let dice: Dice;
      do {
        dice = this.roll();
        this.match = applyMatchAction(this.match, { type: "roll", dice });
      } while (this.match.game.phase === "opening");
      opening = dice;
    }
    const gameJustEnded = this.match.game.result !== null && before.game.result === null;
    if (gameJustEnded) {
      const g = this.match.game;
      this.games.push({ variant: g.variant, history: g.history, result: g.result });
    }
    this.scheduleClock();
    this.startTurnClock();
    this.broadcast(this.stateMessage(action, by, opening));
    this.lastState = { action, by, opening };
    this.showSpectators();

    if (gameJustEnded) {
      if (this.match.winner !== null) this.finish("won");
      else {
        this.nextGameTimer = setTimeout(() => {
          this.nextGameTimer = null;
          if (!this.ended) this.advance({ type: "next-game" }, null);
        }, this.deps.timings.nextGameMs);
      }
    }
  }

  // ---- think times ---------------------------------------------------------------------------

  /** Starts timing when a player begins a checker-play decision (dice rolled, nothing moved yet). */
  private startTurnClock(): void {
    const g = this.match.game;
    if (g.phase !== "moving") {
      this.turnClock = null;
      return;
    }
    const key = this.match.results.length * 10_000 + g.history.length;
    if (this.turnClock?.key === key) return;
    let choice = false;
    try {
      choice = turnOptions(g).length > 1;
    } catch {
      // timing is only a hint; never disturb the game
    }
    this.turnClock = { seat: g.turn, since: Date.now(), choice, key };
  }

  private recordThinkTime(seat: Player, ms: number): void {
    // Clamped: sub-second confirms are pre-moves or auto-play, very long ones were interrupted.
    const ln = Math.log(Math.min(Math.max(ms, 300), this.deps.timings.turnMs) / 1000);
    const t = this.timing[seat];
    this.timing[seat] = { n: t.n + 1, sumLog: t.sumLog + ln, sumLog2: t.sumLog2 + ln * ln };
  }

  // ---- clock ---------------------------------------------------------------------------------

  private get chessClock(): { delayMs: number } | null {
    const c = this.deps.timeControl;
    return c && c !== "relaxed" ? CLOCK_SPECS[c] : null;
  }

  private scheduleClock(): void {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
    this.deadline = null;
    const actor = playerToAct(this.match.game);
    if (this.chessClock) return this.runChessClock(actor);
    if (this.ended || actor === null || this.match.winner !== null) return;
    const g = this.match.game;
    const ms =
      g.phase === "cube-offered" || g.resignOffer ? this.deps.timings.cubeMs : this.deps.timings.turnMs;
    this.deadline = Date.now() + ms;
    this.clock = setTimeout(() => this.timeout(actor), ms);
  }

  /**
   * Chess clock with delay: a decision (roll and move, a cube answer, a resign answer) first
   * uses the delay; only the rest comes off the reserve when the decision ends. A decision
   * without a choice (at most one way to play) costs no reserve. The flag falls when delay and
   * reserve are used up: the match is lost.
   */
  private runChessClock(actor: Player | null): void {
    const spec = this.chessClock!;
    const now = Date.now();
    const g = this.match.game;
    const running = !this.ended && actor !== null && this.match.winner === null;
    const key = running
      ? `${actor}:${this.match.results.length}:${g.history.length}:${g.phase === "cube-offered" ? 1 : 0}:${g.resignOffer ? 1 : 0}`
      : "";
    const d = this.decision;
    if (d && d.key !== key) {
      if (!d.free)
        this.reserve[d.seat] = Math.max(0, this.reserve[d.seat] - Math.max(0, now - d.start - spec.delayMs));
      this.decision = null;
    }
    if (!running || actor === null) return;
    if (!this.decision) this.decision = { seat: actor, start: now, key, free: false, checked: false };
    const cur = this.decision;
    // checker play without a choice is free (decided once the dice are known)
    if (!cur.checked && g.phase === "moving") {
      cur.checked = true;
      try {
        cur.free = turnOptions(g).length <= 1;
      } catch {
        cur.free = false;
      }
    }
    this.deadline = cur.start + spec.delayMs + this.reserve[actor];
    this.clock = setTimeout(() => this.flag(actor), Math.max(0, this.deadline - now));
  }

  /** The flag fell: the player lost on time. */
  private flag(seat: Player): void {
    if (this.ended) return;
    this.deps.log?.(`room ${this.id}: seat ${seat} lost on time`);
    this.reserve[seat] = 0;
    this.forfeit(seat, "time");
  }

  private clockView(): ClockView | null {
    const c = this.deps.timeControl;
    if (!c || c === "relaxed") return null;
    const d = this.decision;
    return {
      control: c,
      delayMs: CLOCK_SPECS[c].delayMs,
      reserve: [this.reserve[0], this.reserve[1]],
      running: d?.seat ?? null,
      since: d?.start ?? null,
      free: d?.free ?? false,
    };
  }

  /** Time is up: a bot acts for the player so the game goes on; repeated timeouts forfeit. */
  private timeout(seat: Player): void {
    if (this.ended) return;
    const s = this.seats[seat];
    s.timeouts++;
    this.deps.log?.(`room ${this.id}: timeout seat ${seat} (${s.timeouts})`);
    if (s.timeouts >= this.deps.timings.maxTimeouts) return this.forfeit(seat, "abandoned");
    const g = this.match.game;
    try {
      if (g.resignOffer) {
        this.advance(
          { type: shouldAcceptResign(g, this.matchContext()) ? "accept-resign" : "reject-resign" },
          seat,
        );
        return;
      }
      switch (g.phase) {
        case "rolling":
          this.advance(isClosedOut(g) ? { type: "pass" } : { type: "roll", dice: this.roll() }, seat);
          break;
        case "cube-offered":
          this.advance({ type: shouldTake(g, "medium", this.matchContext()) ? "take" : "drop" }, seat);
          break;
        case "moving": {
          for (const move of chooseMoves(g, "medium", this.rng)) {
            if (this.match.game.phase !== "moving") break;
            this.advance({ type: "move", move }, seat);
          }
          const after = this.match.game;
          if (after.phase === "moving" && after.turn === seat && canConfirm(after)) {
            this.advance({ type: "confirm" }, seat);
          }
          break;
        }
        default:
          break;
      }
    } catch (e) {
      this.deps.log?.(`room ${this.id}: timeout handling failed: ${String(e)}`);
    }
  }

  /** Score and Crawford state for match-aware bot decisions on timeouts. */
  private matchContext(): MatchContext {
    const m = this.match;
    return { length: m.config.length, score: m.score, crawford: m.crawford };
  }

  /** Quick message to both players (at most one every 1.5 s per seat). */
  emote(seat: Player, id: EmoteId): void {
    const now = Date.now();
    if (this.ended || now - this.lastEmote[seat] < 1_500) return;
    this.lastEmote[seat] = now;
    this.broadcast({ t: "emote", seat, id });
  }

  // ---- end -----------------------------------------------------------------------------------

  private forfeit(loser: Player, reason: MatchEndReason): void {
    if (this.ended) return;
    this.match = { ...this.match, winner: opponent(loser) };
    this.finish(reason);
  }

  private finish(reason: MatchEndReason): void {
    if (this.ended) return;
    this.ended = true;
    if (this.clock) clearTimeout(this.clock);
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer);
    if (this.seedTimer) clearTimeout(this.seedTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
    this.deadline = null;
    const winner = this.match.winner ?? 0;
    const unfinished = this.match.game.result === null && this.match.game.history.length > 0;
    const games = unfinished
      ? [...this.games, { variant: this.match.game.variant, history: this.match.game.history }]
      : this.games;
    const ratingDelta = this.deps.onEnd(this, {
      id: this.id,
      variant: this.variant,
      length: this.config.length,
      players: [this.seats[0].player.id, this.seats[1].player.id],
      winner,
      score: this.match.score,
      reason,
      games,
      startedAt: this.startedAt,
      pool: poolOf(this.deps.timeControl),
      // Leaving before anybody moved is not rated.
      rated: (this.deps.rating?.rated ?? true) && (this.moved || reason === "won"),
      fairness: this.fairnessReveal(),
      timing: this.timing,
    });
    this.broadcast({
      t: "match-end",
      winner,
      reason,
      score: this.match.score,
      ratingDelta,
      fairness: this.fairnessReveal(),
    });
    const end: ServerMessage = { t: "watch-end", matchId: this.id, winner, reason, score: this.match.score };
    this.later(() => {
      for (const c of this.spectators) c.send(end);
      this.spectators.clear();
    });
  }

  /** Runs `fn` after the spectator delay (at once without delay). */
  private later(fn: () => void): void {
    const delay = this.delayMs;
    if (delay <= 0) return fn();
    const timer = setTimeout(() => {
      this.delayTimers.delete(timer);
      fn();
    }, delay);
    this.delayTimers.add(timer);
  }

  get delayMs(): number {
    return this.deps.spectatorDelayMs ?? 0;
  }

  // ---- spectators ----------------------------------------------------------------------------

  get tournamentRef(): TournamentRef | undefined {
    return this.deps.tournament;
  }

  /** Public and running: anybody may watch, and it is listed. */
  get watchable(): boolean {
    return !!this.deps.watchable && !this.ended;
  }

  get isPublic(): boolean {
    return !!this.deps.watchable;
  }

  get spectatorCount(): number {
    return this.spectators.size;
  }

  /**
   * Adds a read-only viewer (the lobby checks who may watch a private match); false when the
   * match is over or full. The viewer first gets the position as of the delay.
   */
  watch(conn: Conn): boolean {
    if (this.ended || this.spectators.size >= MAX_SPECTATORS) return false;
    this.spectators.add(conn);
    const now = Date.now();
    const shown =
      [...this.snapshots].reverse().find((s) => s.at <= now - this.delayMs) ?? this.snapshots[0] ?? null;
    conn.send({ ...(shown?.msg ?? this.watchState()), spectators: this.spectators.size });
    // changes still inside the delay window follow at their time
    for (const snap of this.snapshots) {
      const wait = snap.at + this.delayMs - now;
      if (wait <= 0 || snap === shown) continue;
      const timer = setTimeout(() => {
        this.delayTimers.delete(timer);
        if (this.spectators.has(conn)) conn.send({ ...snap.msg, spectators: this.spectators.size });
      }, wait);
      this.delayTimers.add(timer);
    }
    return true;
  }

  unwatch(conn: Conn): void {
    this.spectators.delete(conn);
  }

  /** Records the current position and sends it to the spectators after the delay. */
  private showSpectators(): void {
    const now = Date.now();
    const msg = this.watchState();
    this.snapshots.push({ at: now, msg });
    // keep everything newer than the delay plus the last older one (what spectators see now)
    const cutoff = now - this.delayMs;
    const older = this.snapshots.filter((s) => s.at <= cutoff);
    this.snapshots = [...older.slice(-1), ...this.snapshots.filter((s) => s.at > cutoff)];
    if (this.spectators.size === 0) return;
    // only those watching now; later viewers get it from the snapshots in watch()
    const viewers = [...this.spectators];
    this.later(() => {
      for (const c of viewers)
        if (this.spectators.has(c)) c.send({ ...msg, spectators: this.spectators.size });
    });
  }

  private watchState(): Extract<ServerMessage, { t: "watch-state" }> {
    const { action, by, opening } = this.lastState;
    return {
      t: "watch-state",
      matchId: this.id,
      variant: this.variant,
      length: this.config.length,
      players: [this.seats[0].player, this.seats[1].player],
      tournament: this.deps.tournament ?? null,
      match: this.match,
      action,
      by,
      opening,
      // a delayed clock would only mislead
      deadline: this.delayMs > 0 ? null : this.deadline,
      serverTime: Date.now(),
      spectators: this.spectators.size,
      delayMs: this.delayMs,
      private: !this.deps.watchable,
    };
  }

  /** Stops timers without persisting (server shutdown). */
  dispose(): void {
    this.ended = true;
    for (const timer of this.delayTimers) clearTimeout(timer);
    this.delayTimers.clear();
    if (this.clock) clearTimeout(this.clock);
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer);
    if (this.seedTimer) clearTimeout(this.seedTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
  }

  // ---- messaging -----------------------------------------------------------------------------

  private stateMessage(action: MatchAction | null, by: Player | null, opening: Dice | null): ServerMessage {
    return {
      t: "state",
      match: this.match,
      action,
      by,
      opening,
      deadline: this.deadline,
      clock: this.clockView(),
      serverTime: Date.now(),
    };
  }

  private sendStart(seat: Player): void {
    this.sendTo(seat, {
      t: "match-start",
      matchId: this.id,
      seat,
      players: [this.seats[0].player, this.seats[1].player],
      config: this.config,
      rated: this.deps.rating?.rated ?? true,
      unratedReason: this.deps.rating?.reason ?? null,
      fairness: { commit: this.commit },
      tournament: this.deps.tournament ?? null,
      timeControl: this.deps.timeControl ?? "relaxed",
    });
  }

  private sendTo(seat: Player, msg: ServerMessage): void {
    this.seats[seat].conn?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const s of this.seats) s.conn?.send(msg);
  }
}
