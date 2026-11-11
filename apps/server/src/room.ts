import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { chooseMoves, shouldAcceptResign, shouldTake } from "@tavli/ai";
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
} from "@tavli/engine";
import {
  type ClientAction,
  diceFromDigest,
  type EmoteId,
  type FairnessReveal,
  fairRollMessage,
  type MatchEndReason,
  type MatchVariantId,
  type PublicPlayer,
  type ServerMessage,
  type UnratedReason,
} from "@tavli/protocol";
import type { FinishedMatch, StoredGame } from "./db";

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
}

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
    if (!this.ended) this.forfeit(seat, "forfeit");
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
      this.advance(matchAction, seat);
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
    this.broadcast(this.stateMessage(action, by, opening));

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

  // ---- clock ---------------------------------------------------------------------------------

  private scheduleClock(): void {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
    this.deadline = null;
    const actor = playerToAct(this.match.game);
    if (this.ended || actor === null || this.match.winner !== null) return;
    const g = this.match.game;
    const ms =
      g.phase === "cube-offered" || g.resignOffer ? this.deps.timings.cubeMs : this.deps.timings.turnMs;
    this.deadline = Date.now() + ms;
    this.clock = setTimeout(() => this.timeout(actor), ms);
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
        this.advance({ type: shouldAcceptResign(g) ? "accept-resign" : "reject-resign" }, seat);
        return;
      }
      switch (g.phase) {
        case "rolling":
          this.advance(isClosedOut(g) ? { type: "pass" } : { type: "roll", dice: this.roll() }, seat);
          break;
        case "cube-offered":
          this.advance({ type: shouldTake(g, "medium") ? "take" : "drop" }, seat);
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
      // Leaving before anybody moved is not rated.
      rated: (this.deps.rating?.rated ?? true) && (this.moved || reason === "won"),
      fairness: this.fairnessReveal(),
    });
    this.broadcast({
      t: "match-end",
      winner,
      reason,
      score: this.match.score,
      ratingDelta,
      fairness: this.fairnessReveal(),
    });
  }

  /** Stops timers without persisting (server shutdown). */
  dispose(): void {
    this.ended = true;
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
    });
  }

  private sendTo(seat: Player, msg: ServerMessage): void {
    this.seats[seat].conn?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const s of this.seats) s.conn?.send(msg);
  }
}
