import { randomInt, randomUUID } from "node:crypto";
import type { MatchConfig } from "@tavli/engine";
import type {
  ClientMessage,
  LiveMatch,
  MatchVariantId,
  TimeControl,
  TournamentRef,
  UnratedReason,
} from "@tavli/protocol";
import type { Analyzer } from "./analysis";
import { Clubs } from "./clubs";
import type { Correspondence } from "./correspondence";
import type { Store } from "./db";
import { challengeMessage, type Push, tournamentReadyMessage } from "./push";
import { type Conn, MatchRoom, type RoomTimings } from "./room";
import { TournamentError, type TournamentOptions, Tournaments } from "./tournaments";

interface Session {
  playerId: string | null;
  /** Remote address (kept in memory only). */
  readonly ip: string;
  deviceId: string | null;
  /** The match this connection watches. */
  watching: MatchRoom | null;
}

/** An open challenge between two friends. */
interface Challenge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly clock: TimeControl;
  readonly createdAt: number;
  /** Longer when the friend was offline and got a push notification. */
  readonly ttlMs: number;
  /** A league pairing. */
  readonly league?: string;
}

/** A challenge without an answer ends after this time (friend online / notified by push). */
export const CHALLENGE_TTL_MS = 60_000;
export const CHALLENGE_PUSH_TTL_MS = 5 * 60_000;

/** How much later spectators see matches (0 = live); tournaments may use their own delay. */
export interface SpectatorDelay {
  readonly matchMs: number;
  readonly tournamentMs: number;
}

interface PrivateInvite {
  readonly hostId: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly clock: TimeControl;
  readonly createdAt: number;
}

interface QueueEntry {
  readonly playerId: string;
  readonly rating: number;
  readonly since: number;
}

/** What is needed to offer a rematch after a match ended. */
interface FinishedPairing {
  readonly matchId: string;
  readonly opponentId: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly clock: TimeControl;
  /** Player ids by seat in the finished match. */
  readonly seats: readonly [string, string];
}

/**
 * Rating-based matchmaking: two waiting players are paired when their rating difference fits
 * into the larger of their search windows; a window starts at `baseWindow` and grows with the
 * waiting time, so nobody waits forever but close ratings are preferred.
 */
export interface MatchmakingOptions {
  readonly baseWindow: number;
  readonly growthPerSecond: number;
  /** How often waiting players are re-checked as their windows grow. */
  readonly sweepMs: number;
}

/**
 * Protection against playing against oneself (rating farming):
 * - the same device (browser id) is never paired in the public queue, private games are unrated;
 * - the same network (IP) likewise, unless disabled (e.g. for tests or LAN events);
 * - only a limited number of rated matches per pair of players within a time window.
 */
export interface FairPlayOptions {
  readonly blockSameNetwork: boolean;
  readonly maxRatedPerPair: number;
  readonly pairWindowMs: number;
}

export const DEFAULT_FAIR_PLAY: FairPlayOptions = {
  blockSameNetwork: true,
  maxRatedPerPair: 3,
  pairWindowMs: 24 * 60 * 60_000,
};

export const DEFAULT_MATCHMAKING: MatchmakingOptions = {
  baseWindow: 100,
  growthPerSecond: 10,
  sweepMs: 2_000,
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LENGTH = 6;
const INVITE_TTL_MS = 30 * 60_000;
const REMATCH_TTL_MS = 5 * 60_000;

const queueKey = (variant: MatchVariantId, length: number, clock: TimeControl) =>
  `${variant}:${length}:${clock}`;
const parseKey = (key: string) => {
  const [variant, length, clock] = key.split(":");
  return { variant: variant as MatchVariantId, length: Number(length), clock: clock as TimeControl };
};

const configFor = (variant: MatchVariantId, length: number): MatchConfig => ({
  variant,
  length,
  crawford: true,
  // money sessions: gammons only count once the cube was turned
  jacoby: length === 0,
});

export interface LobbyOptions {
  readonly store: Store;
  readonly timings: RoomTimings;
  readonly matchmaking?: Partial<MatchmakingOptions>;
  readonly fairPlay?: Partial<FairPlayOptions>;
  readonly log?: (msg: string) => void;
  /** Deterministic seat assignment for tests. */
  readonly randomSeats?: boolean;
  /** Fair-play analysis of finished matches (stored per player). */
  readonly analyzer?: Analyzer;
  readonly tournaments?: Partial<TournamentOptions>;
  /** Web Push for players who are not connected (tournament matches). */
  readonly push?: Push;
  readonly spectatorDelay?: Partial<SpectatorDelay>;
}

/**
 * Connections, matchmaking queues, private invites, rematch offers and the mapping from players
 * to their running match. A player has at most one connection and one match at a time.
 */
export class Lobby {
  private readonly sessions = new Map<Conn, Session>();
  private readonly connByPlayer = new Map<string, Conn>();
  private readonly queues = new Map<string, QueueEntry[]>();
  private readonly invites = new Map<string, PrivateInvite>();
  private readonly roomByPlayer = new Map<string, MatchRoom>();
  private readonly finished = new Map<string, FinishedPairing & { endedAt: number }>();
  private readonly rematchOffers = new Map<string, Set<string>>();
  private readonly failedJoins = new Map<string, { n: number; since: number }>();
  private readonly challenges = new Map<string, Challenge>();
  private lastClubTick = 0;
  private readonly mm: MatchmakingOptions;
  private readonly fair: FairPlayOptions;
  private readonly sweepTimer: ReturnType<typeof setInterval>;
  readonly tournaments: Tournaments;
  readonly clubs: Clubs;
  /** Set by the server: correspondence games (for correspondence leagues). */
  corr: Correspondence | null = null;

  constructor(private readonly opts: LobbyOptions) {
    this.mm = { ...DEFAULT_MATCHMAKING, ...opts.matchmaking };
    this.fair = { ...DEFAULT_FAIR_PLAY, ...opts.fairPlay };
    this.tournaments = new Tournaments(
      opts.store,
      {
        isAvailable: (id) => this.connByPlayer.has(id) && !this.inMatch(id),
        startTournamentMatch: (variant, length, p0, p1, ref, slot, clock) =>
          this.startMatch(variant, length, p0, p1, true, { ref, slot }, true, undefined, clock),
        push: (id, tournament) => this.connByPlayer.get(id)?.send({ t: "tournament", tournament }),
        matchReady: (id, view, ref) => {
          // Connected players see it in the app (and get a local notification when it is hidden).
          if (this.connByPlayer.has(id) || !opts.push) return;
          const m = view.rounds[ref.round]?.find((x) => x.players.includes(id));
          const opponent = view.players.find((p) => p.id !== id && m?.players.includes(p.id))?.name ?? "?";
          void opts.push.send(id, (lang) => tournamentReadyMessage(lang, ref, opponent));
        },
        clubRole: (clubId, id) =>
          this.clubs.isAdmin(clubId, id) ? "admin" : this.clubs.isMember(clubId, id) ? "member" : null,
        clubName: (clubId) => this.clubs.clubName(clubId),
      },
      opts.tournaments,
      opts.log,
    );
    this.clubs = new Clubs(
      opts.store,
      {
        presence: (id, viewer) => this.presence(id, viewer),
        clubTournaments: (clubId) => this.tournaments.forClub(clubId),
        startCorrGame: (league, p0, p1, variant, length, days) => {
          if (!this.corr) throw new Error("correspondence games are not available");
          return this.corr.startLeagueGame(league, p0, p1, variant, length, days);
        },
        endCorrGame: (id) => this.corr?.endWithoutResult(id),
      },
      opts.log,
    );
    this.sweepTimer = setInterval(() => this.sweep(), this.mm.sweepMs);
  }

  get activeRooms(): number {
    return new Set(this.roomByPlayer.values()).size;
  }

  connect(conn: Conn, ip = ""): void {
    this.sessions.set(conn, { playerId: null, ip, deviceId: null, watching: null });
  }

  isConnected(playerId: string): boolean {
    return this.connByPlayer.has(playerId);
  }

  isAuthenticated(conn: Conn): boolean {
    return !!this.sessions.get(conn)?.playerId;
  }

  disconnect(conn: Conn): void {
    const session = this.sessions.get(conn);
    this.sessions.delete(conn);
    session?.watching?.unwatch(conn);
    const id = session?.playerId;
    if (!id || this.connByPlayer.get(id) !== conn) return;
    this.connByPlayer.delete(id);
    this.endChallengesOf(id, "cancelled");
    this.removeFromQueues(id);
    this.removeInvites(id);
    this.declineRematch(id);
    const room = this.roomByPlayer.get(id);
    const seat = room?.seatOf(id);
    if (room && seat !== null && seat !== undefined) room.disconnect(seat);
  }

  handle(conn: Conn, msg: ClientMessage): void {
    const session = this.sessions.get(conn);
    if (!session) return;
    if (msg.t === "ping") return conn.send({ t: "pong" });
    if (msg.t === "hello") {
      if (session.playerId) return conn.send({ t: "error", message: "already identified" });
      session.deviceId = msg.deviceId ?? null;
      return this.hello(conn, session, msg.playerId, msg.token);
    }
    const id = session.playerId;
    if (!id) return conn.send({ t: "error", message: "say hello first" });

    switch (msg.t) {
      case "queue":
        return this.queue(conn, id, msg.variant, msg.length, msg.clock ?? "relaxed");
      case "unqueue":
        this.removeFromQueues(id);
        this.removeInvites(id);
        return conn.send({ t: "unqueued" });
      case "create":
        return this.createInvite(conn, id, msg.variant, msg.length, msg.clock ?? "relaxed");
      case "join":
        return this.joinInvite(conn, id, msg.code.toUpperCase());
      case "action": {
        const room = this.roomByPlayer.get(id);
        const seat = room?.seatOf(id);
        if (!room || seat === null || seat === undefined)
          return conn.send({ t: "error", message: "not in a match" });
        return room.handle(seat, msg.action);
      }
      case "leave": {
        const room = this.roomByPlayer.get(id);
        const seat = room?.seatOf(id);
        if (room && seat !== null && seat !== undefined) room.leave(seat);
        this.roomByPlayer.delete(id);
        return this.declineRematch(id);
      }
      case "rematch":
        return this.rematch(conn, id);
      case "seed": {
        const room = this.roomByPlayer.get(id);
        const seat = room?.seatOf(id);
        if (room && seat !== null && seat !== undefined) room.seed(seat, msg.value);
        return;
      }
      case "rematch-decline":
        return this.declineRematch(id);
      case "tournament-create":
      case "tournament-join":
      case "tournament-leave":
        try {
          if (msg.t === "tournament-create") {
            if (this.busy(conn, id)) return;
            this.tournaments.create(
              id,
              msg.name,
              msg.variant,
              msg.length,
              msg.size,
              msg.format,
              msg.clubId ?? null,
              msg.clock ?? "relaxed",
            );
          } else if (msg.t === "tournament-join") this.tournaments.join(id, msg.id);
          else this.tournaments.leave(id, msg.id);
        } catch (e) {
          if (e instanceof TournamentError) conn.send({ t: "error", message: e.message });
          else throw e;
        }
        return;
      case "watch":
        return this.watch(conn, session, msg.matchId);
      case "unwatch":
        session.watching?.unwatch(conn);
        session.watching = null;
        return;
      case "challenge":
        return this.challenge(
          conn,
          id,
          msg.playerId,
          msg.variant,
          msg.length,
          msg.clock ?? "relaxed",
          msg.leagueId,
        );
      case "challenge-answer":
        return this.answerChallenge(conn, id, msg.id, msg.accept);
      case "challenge-cancel": {
        const c = this.challenges.get(msg.id);
        if (c?.from === id) this.endChallenge(c, "cancelled");
        return;
      }
      case "emote": {
        const room = this.roomByPlayer.get(id);
        const seat = room?.seatOf(id);
        if (room && seat !== null && seat !== undefined) room.emote(seat, msg.id);
        return;
      }
    }
  }

  private hello(conn: Conn, session: Session, playerId: string, token: string): void {
    const player = this.opts.store.authenticate(playerId, token);
    if (!player) {
      conn.send({ t: "error", message: "unknown player" });
      return conn.close(4001, "unauthorized");
    }
    if (player.banned) {
      conn.send({ t: "error", message: "banned" });
      return conn.close(4003, "banned");
    }
    // Only one connection per player: the newest wins.
    const old = this.connByPlayer.get(player.id);
    if (old && old !== conn) {
      this.sessions.delete(old);
      old.send({ t: "error", message: "connected from another tab" });
      old.close(4002, "replaced");
    }
    session.playerId = player.id;
    this.connByPlayer.set(player.id, conn);
    const rating = Math.round(this.opts.store.rating(player.id, "backgammon").rating);
    conn.send({ t: "welcome", player: { id: player.id, name: player.name, rating } });
    this.deliverChallenges(player.id);
    const room = this.roomByPlayer.get(player.id);
    const seat = room?.seatOf(player.id);
    if (room && seat !== null && seat !== undefined && !room.ended) room.reconnect(seat, conn);
  }

  private inMatch(id: string): boolean {
    const room = this.roomByPlayer.get(id);
    return !!room && !room.ended;
  }

  private busy(conn: Conn, id: string): boolean {
    const room = this.roomByPlayer.get(id);
    if (room && !room.ended) {
      conn.send({ t: "error", message: "already in a match" });
      return true;
    }
    return false;
  }

  // ---- fair play -----------------------------------------------------------------------------

  private sessionOf(playerId: string): Session | undefined {
    const conn = this.connByPlayer.get(playerId);
    return conn ? this.sessions.get(conn) : undefined;
  }

  /** Same browser or (optionally) same network: very likely the same person. */
  private sameOrigin(a: string, b: string): UnratedReason | null {
    const sa = this.sessionOf(a);
    const sb = this.sessionOf(b);
    if (!sa || !sb) return null;
    if (sa.deviceId && sa.deviceId === sb.deviceId) return "same-device";
    if (this.fair.blockSameNetwork && sa.ip && sa.ip === sb.ip) return "same-network";
    return null;
  }

  private ratingPolicy(a: string, b: string): { rated: boolean; reason: UnratedReason | null } {
    const origin = this.sameOrigin(a, b);
    if (origin) return { rated: false, reason: origin };
    const since = new Date(Date.now() - this.fair.pairWindowMs).toISOString();
    if (this.opts.store.ratedMatchesBetween(a, b, since) >= this.fair.maxRatedPerPair) {
      return { rated: false, reason: "repeat-opponent" };
    }
    return { rated: true, reason: null };
  }

  // ---- matchmaking ---------------------------------------------------------------------------

  private window(e: QueueEntry, now: number): number {
    return this.mm.baseWindow + (this.mm.growthPerSecond * (now - e.since)) / 1000;
  }

  private canPair(a: QueueEntry, b: QueueEntry, now: number): boolean {
    return Math.abs(a.rating - b.rating) <= Math.max(this.window(a, now), this.window(b, now));
  }

  /** Best waiting partner for an entry (closest rating within the windows). */
  private partnerFor(entry: QueueEntry, waiting: readonly QueueEntry[], now: number): QueueEntry | null {
    let best: QueueEntry | null = null;
    for (const w of waiting) {
      if (w.playerId === entry.playerId || !this.connByPlayer.has(w.playerId) || !this.canPair(entry, w, now))
        continue;
      // Never pair one person with themselves in the public queue.
      if (this.sameOrigin(entry.playerId, w.playerId)) continue;
      if (!best || Math.abs(w.rating - entry.rating) < Math.abs(best.rating - entry.rating)) best = w;
    }
    return best;
  }

  private queue(conn: Conn, id: string, variant: MatchVariantId, length: number, clock: TimeControl): void {
    if (this.busy(conn, id)) return;
    this.removeFromQueues(id);
    this.removeInvites(id);
    this.declineRematch(id);
    const key = queueKey(variant, length, clock);
    const waiting = this.queues.get(key) ?? [];
    const entry: QueueEntry = {
      playerId: id,
      rating: this.opts.store.rating(id, variant).rating,
      since: Date.now(),
    };
    const partner = this.partnerFor(entry, waiting, entry.since);
    if (partner) {
      this.queues.set(
        key,
        waiting.filter((w) => w !== partner),
      );
      this.startMatch(variant, length, partner.playerId, id, false, undefined, true, undefined, clock);
      return;
    }
    this.queues.set(key, [...waiting, entry]);
    conn.send({ t: "queued", variant, length, clock });
  }

  /** Pairs waiting players whose windows have grown enough, longest waiting first. */
  private sweep(): void {
    try {
      this.tournaments.tick();
    } catch (e) {
      this.opts.log?.(`tournament tick failed: ${String(e)}`);
    }
    const now = Date.now();
    for (const c of this.challenges.values())
      if (now - c.createdAt > c.ttlMs) this.endChallenge(c, "expired");
    if (now - this.lastClubTick > 60_000) {
      this.lastClubTick = now;
      try {
        this.clubs.tick(now);
      } catch (e) {
        this.opts.log?.(`league tick failed: ${String(e)}`);
      }
    }
    for (const [key, list] of this.queues) {
      let waiting = list.filter((w) => this.connByPlayer.has(w.playerId));
      const { variant, length, clock } = parseKey(key);
      for (const entry of [...waiting].sort((a, b) => a.since - b.since)) {
        if (!waiting.includes(entry)) continue;
        const partner = this.partnerFor(
          entry,
          waiting.filter((w) => w !== entry),
          now,
        );
        if (!partner) continue;
        waiting = waiting.filter((w) => w !== entry && w !== partner);
        this.startMatch(
          variant,
          length,
          entry.playerId,
          partner.playerId,
          false,
          undefined,
          true,
          undefined,
          clock,
        );
      }
      this.queues.set(key, waiting);
    }
  }

  // ---- private invites -----------------------------------------------------------------------

  private createInvite(
    conn: Conn,
    id: string,
    variant: MatchVariantId,
    length: number,
    clock: TimeControl,
  ): void {
    if (this.busy(conn, id)) return;
    this.removeFromQueues(id);
    this.removeInvites(id);
    this.declineRematch(id);
    this.pruneInvites();
    let code: string;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(
        "",
      );
    } while (this.invites.has(code));
    this.invites.set(code, { hostId: id, variant, length, clock, createdAt: Date.now() });
    conn.send({ t: "room-created", code, variant, length });
  }

  private joinInvite(conn: Conn, id: string, code: string): void {
    if (this.busy(conn, id)) return;
    this.pruneInvites();
    const ip = this.sessions.get(conn)?.ip ?? "";
    const failed = this.failedJoins.get(ip);
    if (failed && Date.now() - failed.since < 10 * 60_000 && failed.n >= 20)
      return conn.send({ t: "error", message: "too many attempts" });
    const invite = this.invites.get(code);
    if (!invite || !this.connByPlayer.has(invite.hostId)) {
      // Invite codes are short: count misses per address against guessing.
      const f = failed && Date.now() - failed.since < 10 * 60_000 ? failed : { n: 0, since: Date.now() };
      this.failedJoins.set(ip, { n: f.n + 1, since: f.since });
      if (this.failedJoins.size > 10_000) this.failedJoins.clear();
      return conn.send({ t: "error", message: "invite not found" });
    }
    if (invite.hostId === id) return conn.send({ t: "error", message: "cannot join your own invite" });
    this.invites.delete(code);
    this.removeFromQueues(id);
    this.declineRematch(id);
    this.startMatch(
      invite.variant,
      invite.length,
      invite.hostId,
      id,
      false,
      undefined,
      false,
      undefined,
      invite.clock,
    );
  }

  // ---- rematch -------------------------------------------------------------------------------

  private rematch(conn: Conn, id: string): void {
    if (this.busy(conn, id)) return;
    const mine = this.finished.get(id);
    const theirs = mine ? this.finished.get(mine.opponentId) : undefined;
    if (!mine || Date.now() - mine.endedAt > REMATCH_TTL_MS || theirs?.matchId !== mine.matchId) {
      this.finished.delete(id);
      return conn.send({ t: "rematch-declined" });
    }
    const accepted = this.rematchOffers.get(mine.matchId) ?? new Set<string>();
    accepted.add(id);
    this.rematchOffers.set(mine.matchId, accepted);
    if (!accepted.has(mine.opponentId)) {
      this.connByPlayer.get(mine.opponentId)?.send({ t: "rematch-offer" });
      return;
    }
    this.rematchOffers.delete(mine.matchId);
    this.finished.delete(id);
    this.finished.delete(mine.opponentId);
    // Same settings, colours swapped.
    this.startMatch(
      mine.variant,
      mine.length,
      mine.seats[1],
      mine.seats[0],
      true,
      undefined,
      false,
      undefined,
      mine.clock,
    );
  }

  private declineRematch(id: string): void {
    const mine = this.finished.get(id);
    if (!mine) return;
    this.finished.delete(id);
    this.rematchOffers.delete(mine.matchId);
    if (this.finished.get(mine.opponentId)?.matchId === mine.matchId) {
      this.finished.delete(mine.opponentId);
      this.connByPlayer.get(mine.opponentId)?.send({ t: "rematch-declined" });
    }
  }

  // ---- rooms ---------------------------------------------------------------------------------

  private startMatch(
    variant: MatchVariantId,
    length: number,
    a: string,
    b: string,
    fixedSeats = false,
    tournament?: { readonly ref: TournamentRef; readonly slot: number },
    watchable = false,
    league?: string,
    clock: TimeControl = "relaxed",
  ): string {
    const { store, timings, log } = this.opts;
    const swap = !fixedSeats && this.opts.randomSeats !== false && randomInt(2) === 1;
    const ids: [string, string] = swap ? [b, a] : [a, b];
    const rating = length === 0 ? { rated: false, reason: "money" as const } : this.ratingPolicy(a, b);
    const room = new MatchRoom(
      variant,
      configFor(variant, length),
      [store.publicPlayer(ids[0], variant), store.publicPlayer(ids[1], variant)],
      {
        timings,
        log,
        rating,
        tournament: tournament?.ref,
        watchable,
        timeControl: clock,
        spectatorDelayMs: tournament
          ? (this.opts.spectatorDelay?.tournamentMs ?? this.opts.spectatorDelay?.matchMs ?? 0)
          : (this.opts.spectatorDelay?.matchMs ?? 0),
        onEnd: (r, result) => {
          const endedAt = Date.now();
          for (const [seat, s] of r.seats.entries()) {
            if (this.roomByPlayer.get(s.player.id) === r) this.roomByPlayer.delete(s.player.id);
            if (tournament) continue; // no rematch offers in tournaments
            this.finished.set(s.player.id, {
              matchId: r.id,
              opponentId: r.seats[seat === 0 ? 1 : 0].player.id,
              variant,
              length,
              clock,
              seats: [r.seats[0].player.id, r.seats[1].player.id],
              endedAt,
            });
          }
          let deltas: [number, number] = [0, 0];
          try {
            deltas = store.saveMatch(result);
          } catch (e) {
            log?.(`saving match ${r.id} failed: ${String(e)}`);
            return deltas;
          }
          this.analyse(r.id, result.players, result.games);
          if (league) {
            try {
              this.clubs.matchEnded(league, result.players, result.players[result.winner], result.score);
            } catch (e) {
              log?.(`league update after ${r.id} failed: ${String(e)}`);
            }
          }
          if (tournament) {
            try {
              this.tournaments.matchEnded(
                tournament.ref,
                tournament.slot,
                result.players[result.winner],
                result.score,
              );
            } catch (e) {
              log?.(`tournament update after ${r.id} failed: ${String(e)}`);
            }
          }
          return deltas;
        },
      },
    );
    for (const [seat, pid] of ids.entries()) {
      this.removeFromQueues(pid);
      this.removeInvites(pid);
      this.roomByPlayer.set(pid, room);
      const conn = this.connByPlayer.get(pid);
      if (conn) room.attach(seat as 0 | 1, conn);
    }
    log?.(
      `match ${room.id} started: ${variant}/${length}${rating.rated ? "" : ` (unrated: ${rating.reason})`}`,
    );
    room.start();
    return room.id;
  }

  /** Compares both players' checker play with the bot in the background and stores it. */
  private analyse(
    matchId: string,
    players: readonly [string, string],
    games: Parameters<Analyzer["analyse"]>[0],
  ) {
    const { analyzer, store, log } = this.opts;
    if (!analyzer) return;
    analyzer
      .analyse(games)
      .then((a) => {
        if (!a) return;
        for (const seat of [0, 1] as const) {
          if (a[seat].decisions > 0) store.saveAnalysis(matchId, players[seat], a[seat]);
        }
      })
      .catch((e) => log?.(`analysis of ${matchId} failed: ${String(e)}`));
  }

  private removeFromQueues(id: string): void {
    for (const [key, list] of this.queues) {
      if (list.some((e) => e.playerId === id))
        this.queues.set(
          key,
          list.filter((e) => e.playerId !== id),
        );
    }
  }

  private removeInvites(id: string): void {
    for (const [code, inv] of this.invites) if (inv.hostId === id) this.invites.delete(code);
  }

  private pruneInvites(): void {
    const now = Date.now();
    for (const [code, inv] of this.invites)
      if (now - inv.createdAt > INVITE_TTL_MS) this.invites.delete(code);
  }

  /** Ends a banned player's connection; a running match is forfeited after the grace period. */
  /** Disconnects a banned player, or one who deleted the profile (also forfeiting a running match). */
  kick(playerId: string, reason: "banned" | "deleted" = "banned"): void {
    this.removeFromQueues(playerId);
    this.removeInvites(playerId);
    if (reason === "deleted") {
      const room = this.roomByPlayer.get(playerId);
      const seat = room?.seatOf(playerId);
      if (room && seat !== null && seat !== undefined && !room.ended) room.leave(seat);
      this.tournaments.withdrawEverywhere(playerId);
    }
    const conn = this.connByPlayer.get(playerId);
    if (!conn) return;
    conn.send({ t: "error", message: reason });
    conn.close(reason === "banned" ? 4003 : 4004, reason);
  }

  /** Whether both players sit in the same running or recently finished match. */
  sharedMatch(a: string, b: string, matchId: string): boolean {
    const room = this.roomByPlayer.get(a);
    if (room?.id === matchId && room.seatOf(b) !== null) return true;
    const done = this.finished.get(a);
    return done?.matchId === matchId && done.opponentId === b;
  }

  /** Stops all rooms and timers (server shutdown). */
  // ---- spectators ----------------------------------------------------------------------------

  private watch(conn: Conn, session: Session, matchId: string): void {
    session.watching?.unwatch(conn);
    session.watching = null;
    const room = this.roomById(matchId);
    const allowed =
      room && (room.isPublic || (session.playerId && this.friendMayWatch(session.playerId, room)));
    if (!room || !allowed || !room.watch(conn))
      return conn.send({ t: "error", message: "match not watchable" });
    session.watching = room;
  }

  /**
   * Private matches (invites, challenges) can be watched by friends of a player, unless one of
   * the two players turned that off.
   */
  private friendMayWatch(viewer: string, room: MatchRoom): boolean {
    const { store } = this.opts;
    const ids = room.seats.map((s) => s.player.id);
    if (ids.includes(viewer)) return false;
    if (!ids.every((id) => store.friendsCanWatch(id))) return false;
    return ids.some((id) => store.areFriends(viewer, id));
  }

  private roomById(matchId: string): MatchRoom | undefined {
    for (const room of this.roomByPlayer.values()) if (room.id === matchId) return room;
    return undefined;
  }

  /** Running public matches (queue and tournaments), best rated first. */
  liveMatches(): LiveMatch[] {
    return [...new Set(this.roomByPlayer.values())]
      .filter((r) => r.watchable)
      .map((r) => ({
        matchId: r.id,
        variant: r.variant,
        length: r.config.length,
        players: [r.seats[0].player, r.seats[1].player] as const,
        score: r.match.score,
        tournament: r.tournamentRef ?? null,
        spectators: r.spectatorCount,
      }))
      .sort((a, b) => b.players[0].rating + b.players[1].rating - a.players[0].rating - a.players[1].rating)
      .slice(0, 50);
  }

  // ---- friends -------------------------------------------------------------------------------

  /** Online state of a player for a friend (`viewer`); the match id only when the viewer may watch. */
  presence(
    playerId: string,
    viewer: string,
  ): { presence: "offline" | "online" | "playing"; matchId: string | null } {
    const room = this.roomByPlayer.get(playerId);
    if (room && !room.ended) {
      const may = room.isPublic || this.friendMayWatch(viewer, room);
      return { presence: "playing", matchId: may ? room.id : null };
    }
    return { presence: this.connByPlayer.has(playerId) ? "online" : "offline", matchId: null };
  }

  /** Sends a message to a player if connected. */
  notify(playerId: string, msg: Parameters<Conn["send"]>[0]): void {
    this.connByPlayer.get(playerId)?.send(msg);
  }

  private challenge(
    conn: Conn,
    id: string,
    to: string,
    requestedVariant: MatchVariantId,
    requestedLength: number,
    clock: TimeControl,
    league?: string,
  ): void {
    const { store } = this.opts;
    // a league pairing plays the league's variant and length; otherwise only friends
    const pairing = league ? this.clubs.pendingPairing(league, id, to) : null;
    if (league && !pairing) return conn.send({ t: "error", message: "no open league match" });
    const variant = pairing?.variant ?? requestedVariant;
    const length = pairing?.length ?? requestedLength;
    const publicTo = () => store.publicPlayer(to, variant);
    if (!pairing && !store.areFriends(id, to)) return conn.send({ t: "error", message: "not friends" });
    if (this.busy(conn, id)) return;
    const online = this.connByPlayer.has(to);
    // offline friends with notifications get a push and a few minutes to come
    const pushable = !online && !!this.opts.push?.hasSubscription(to);
    if (this.inMatch(to) || (!online && !pushable)) {
      return conn.send({ t: "challenge-update", id: "", to: publicTo(), status: "busy" });
    }
    // one open challenge per sender
    this.endChallengesOf(id, "cancelled", true);
    const c: Challenge = {
      id: randomUUID(),
      from: id,
      to,
      variant,
      length,
      clock,
      createdAt: Date.now(),
      ttlMs: online ? CHALLENGE_TTL_MS : CHALLENGE_PUSH_TTL_MS,
      ...(league ? { league } : {}),
    };
    this.challenges.set(c.id, c);
    conn.send({ t: "challenge-update", id: c.id, to: publicTo(), status: online ? "sent" : "notified" });
    const from = store.publicPlayer(id, variant);
    if (online) this.notify(to, { t: "challenge", id: c.id, from, variant, length, clock });
    else void this.opts.push?.send(to, (lang) => challengeMessage(lang, c.id, from.name, variant, length));
  }

  /** Challenges waiting for a player who just connected (after a push notification). */
  private deliverChallenges(playerId: string): void {
    for (const c of this.challenges.values()) {
      if (c.to !== playerId) continue;
      const from = this.opts.store.publicPlayer(c.from, c.variant);
      this.notify(playerId, {
        t: "challenge",
        id: c.id,
        from,
        variant: c.variant,
        length: c.length,
        clock: c.clock,
      });
    }
  }

  private answerChallenge(conn: Conn, id: string, challengeId: string, accept: boolean): void {
    const c = this.challenges.get(challengeId);
    if (!c || c.to !== id) return conn.send({ t: "error", message: "challenge not found" });
    if (!accept) return this.endChallenge(c, "declined");
    if (this.busy(conn, id)) return;
    if (!this.connByPlayer.has(c.from) || this.inMatch(c.from)) return this.endChallenge(c, "busy");
    this.challenges.delete(c.id);
    this.removeFromQueues(c.from);
    this.removeFromQueues(id);
    this.removeInvites(c.from);
    this.removeInvites(id);
    if (c.league && !this.clubs.pendingPairing(c.league, c.from, id))
      return this.endChallenge(c, "cancelled");
    const roomId = this.startMatch(
      c.variant,
      c.length,
      c.from,
      id,
      false,
      undefined,
      !!c.league,
      c.league,
      c.clock,
    );
    if (c.league) this.clubs.matchStarted(c.league, c.from, id, roomId);
  }

  /** Ends a challenge without a match and tells both sides. */
  private endChallenge(c: Challenge, status: "declined" | "cancelled" | "expired" | "busy"): void {
    this.challenges.delete(c.id);
    const to = this.opts.store.publicPlayer(c.to, c.variant);
    for (const p of [c.from, c.to]) this.notify(p, { t: "challenge-update", id: c.id, to, status });
  }

  private endChallengesOf(id: string, status: "cancelled", sentOnly = false): void {
    for (const c of [...this.challenges.values()])
      if (c.from === id || (!sentOnly && c.to === id)) this.endChallenge(c, status);
  }

  /** Tells every connected player that the server goes down (before dispose). */
  announceShutdown(): void {
    for (const conn of this.connByPlayer.values()) conn.send({ t: "error", message: "server restarting" });
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const room of new Set(this.roomByPlayer.values())) room.dispose();
    this.roomByPlayer.clear();
  }
}
