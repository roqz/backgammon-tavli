import { randomInt } from "node:crypto";
import type { MatchConfig } from "@tavli/engine";
import type { ClientMessage, MatchVariantId, UnratedReason } from "@tavli/protocol";
import type { Store } from "./db";
import { type Conn, MatchRoom, type RoomTimings } from "./room";

interface Session {
  playerId: string | null;
  /** Remote address (kept in memory only). */
  readonly ip: string;
  deviceId: string | null;
}

interface PrivateInvite {
  readonly hostId: string;
  readonly variant: MatchVariantId;
  readonly length: number;
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

const queueKey = (variant: MatchVariantId, length: number) => `${variant}:${length}`;
const parseKey = (key: string) => {
  const [variant, length] = key.split(":");
  return { variant: variant as MatchVariantId, length: Number(length) };
};

const configFor = (variant: MatchVariantId, length: number): MatchConfig => ({
  variant,
  length,
  crawford: true,
});

export interface LobbyOptions {
  readonly store: Store;
  readonly timings: RoomTimings;
  readonly matchmaking?: Partial<MatchmakingOptions>;
  readonly fairPlay?: Partial<FairPlayOptions>;
  readonly log?: (msg: string) => void;
  /** Deterministic seat assignment for tests. */
  readonly randomSeats?: boolean;
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
  private readonly mm: MatchmakingOptions;
  private readonly fair: FairPlayOptions;
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor(private readonly opts: LobbyOptions) {
    this.mm = { ...DEFAULT_MATCHMAKING, ...opts.matchmaking };
    this.fair = { ...DEFAULT_FAIR_PLAY, ...opts.fairPlay };
    this.sweepTimer = setInterval(() => this.sweep(), this.mm.sweepMs);
  }

  get activeRooms(): number {
    return new Set(this.roomByPlayer.values()).size;
  }

  connect(conn: Conn, ip = ""): void {
    this.sessions.set(conn, { playerId: null, ip, deviceId: null });
  }

  disconnect(conn: Conn): void {
    const session = this.sessions.get(conn);
    this.sessions.delete(conn);
    const id = session?.playerId;
    if (!id || this.connByPlayer.get(id) !== conn) return;
    this.connByPlayer.delete(id);
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
      session.deviceId = msg.deviceId ?? null;
      return this.hello(conn, session, msg.playerId, msg.token);
    }
    const id = session.playerId;
    if (!id) return conn.send({ t: "error", message: "say hello first" });

    switch (msg.t) {
      case "queue":
        return this.queue(conn, id, msg.variant, msg.length);
      case "unqueue":
        this.removeFromQueues(id);
        this.removeInvites(id);
        return conn.send({ t: "unqueued" });
      case "create":
        return this.createInvite(conn, id, msg.variant, msg.length);
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
    }
  }

  private hello(conn: Conn, session: Session, playerId: string, token: string): void {
    const player = this.opts.store.authenticate(playerId, token);
    if (!player) {
      conn.send({ t: "error", message: "unknown player" });
      return conn.close(4001, "unauthorized");
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
    const room = this.roomByPlayer.get(player.id);
    const seat = room?.seatOf(player.id);
    if (room && seat !== null && seat !== undefined && !room.ended) room.reconnect(seat, conn);
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

  private queue(conn: Conn, id: string, variant: MatchVariantId, length: number): void {
    if (this.busy(conn, id)) return;
    this.removeFromQueues(id);
    this.removeInvites(id);
    this.declineRematch(id);
    const key = queueKey(variant, length);
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
      return this.startMatch(variant, length, partner.playerId, id);
    }
    this.queues.set(key, [...waiting, entry]);
    conn.send({ t: "queued", variant, length });
  }

  /** Pairs waiting players whose windows have grown enough, longest waiting first. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, list] of this.queues) {
      let waiting = list.filter((w) => this.connByPlayer.has(w.playerId));
      const { variant, length } = parseKey(key);
      for (const entry of [...waiting].sort((a, b) => a.since - b.since)) {
        if (!waiting.includes(entry)) continue;
        const partner = this.partnerFor(
          entry,
          waiting.filter((w) => w !== entry),
          now,
        );
        if (!partner) continue;
        waiting = waiting.filter((w) => w !== entry && w !== partner);
        this.startMatch(variant, length, entry.playerId, partner.playerId);
      }
      this.queues.set(key, waiting);
    }
  }

  // ---- private invites -----------------------------------------------------------------------

  private createInvite(conn: Conn, id: string, variant: MatchVariantId, length: number): void {
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
    this.invites.set(code, { hostId: id, variant, length, createdAt: Date.now() });
    conn.send({ t: "room-created", code, variant, length });
  }

  private joinInvite(conn: Conn, id: string, code: string): void {
    if (this.busy(conn, id)) return;
    this.pruneInvites();
    const invite = this.invites.get(code);
    if (!invite || !this.connByPlayer.has(invite.hostId))
      return conn.send({ t: "error", message: "invite not found" });
    if (invite.hostId === id) return conn.send({ t: "error", message: "cannot join your own invite" });
    this.invites.delete(code);
    this.removeFromQueues(id);
    this.declineRematch(id);
    this.startMatch(invite.variant, invite.length, invite.hostId, id);
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
    this.startMatch(mine.variant, mine.length, mine.seats[1], mine.seats[0], true);
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
  ): void {
    const { store, timings, log } = this.opts;
    const swap = !fixedSeats && this.opts.randomSeats !== false && randomInt(2) === 1;
    const ids: [string, string] = swap ? [b, a] : [a, b];
    const rating = this.ratingPolicy(a, b);
    const room = new MatchRoom(
      variant,
      configFor(variant, length),
      [store.publicPlayer(ids[0], variant), store.publicPlayer(ids[1], variant)],
      {
        timings,
        log,
        rating,
        onEnd: (r, result) => {
          const endedAt = Date.now();
          for (const [seat, s] of r.seats.entries()) {
            if (this.roomByPlayer.get(s.player.id) === r) this.roomByPlayer.delete(s.player.id);
            this.finished.set(s.player.id, {
              matchId: r.id,
              opponentId: r.seats[seat === 0 ? 1 : 0].player.id,
              variant,
              length,
              seats: [r.seats[0].player.id, r.seats[1].player.id],
              endedAt,
            });
          }
          try {
            return store.saveMatch(result);
          } catch (e) {
            log?.(`saving match ${r.id} failed: ${String(e)}`);
            return [0, 0];
          }
        },
      },
    );
    for (const [seat, pid] of ids.entries()) {
      this.roomByPlayer.set(pid, room);
      const conn = this.connByPlayer.get(pid);
      if (conn) room.attach(seat as 0 | 1, conn);
    }
    log?.(
      `match ${room.id} started: ${variant}/${length}${rating.rated ? "" : ` (unrated: ${rating.reason})`}`,
    );
    room.start();
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

  /** Stops all rooms and timers (server shutdown). */
  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const room of new Set(this.roomByPlayer.values())) room.dispose();
    this.roomByPlayer.clear();
  }
}
