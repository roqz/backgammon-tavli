import { randomInt } from "node:crypto";
import type { MatchConfig } from "@tavli/engine";
import type { ClientMessage, MatchVariantId } from "@tavli/protocol";
import type { Store } from "./db";
import { type Conn, MatchRoom, type RoomTimings } from "./room";

interface Session {
  playerId: string | null;
}

interface PrivateInvite {
  readonly hostId: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly createdAt: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LENGTH = 6;
const INVITE_TTL_MS = 30 * 60_000;

const queueKey = (variant: MatchVariantId, length: number) => `${variant}:${length}`;

const configFor = (variant: MatchVariantId, length: number): MatchConfig => ({
  variant,
  length,
  crawford: true,
});

export interface LobbyOptions {
  readonly store: Store;
  readonly timings: RoomTimings;
  readonly log?: (msg: string) => void;
  /** Deterministic seat assignment for tests. */
  readonly randomSeats?: boolean;
}

/**
 * Connections, matchmaking queues, private invites and the mapping from players to their
 * running match. A player has at most one connection and one match at a time.
 */
export class Lobby {
  private readonly sessions = new Map<Conn, Session>();
  private readonly connByPlayer = new Map<string, Conn>();
  private readonly queues = new Map<string, string[]>();
  private readonly invites = new Map<string, PrivateInvite>();
  private readonly roomByPlayer = new Map<string, MatchRoom>();

  constructor(private readonly opts: LobbyOptions) {}

  get activeRooms(): number {
    return new Set(this.roomByPlayer.values()).size;
  }

  connect(conn: Conn): void {
    this.sessions.set(conn, { playerId: null });
  }

  disconnect(conn: Conn): void {
    const session = this.sessions.get(conn);
    this.sessions.delete(conn);
    const id = session?.playerId;
    if (!id || this.connByPlayer.get(id) !== conn) return;
    this.connByPlayer.delete(id);
    this.removeFromQueues(id);
    this.removeInvites(id);
    const room = this.roomByPlayer.get(id);
    const seat = room?.seatOf(id);
    if (room && seat !== null && seat !== undefined) room.disconnect(seat);
  }

  handle(conn: Conn, msg: ClientMessage): void {
    const session = this.sessions.get(conn);
    if (!session) return;
    if (msg.t === "ping") return conn.send({ t: "pong" });
    if (msg.t === "hello") return this.hello(conn, session, msg.playerId, msg.token);
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

  private queue(conn: Conn, id: string, variant: MatchVariantId, length: number): void {
    if (this.busy(conn, id)) return;
    this.removeFromQueues(id);
    this.removeInvites(id);
    const key = queueKey(variant, length);
    const waiting = this.queues.get(key) ?? [];
    const opponentId = waiting.find((p) => p !== id && this.connByPlayer.has(p));
    if (opponentId) {
      this.queues.set(
        key,
        waiting.filter((p) => p !== opponentId),
      );
      return this.startMatch(variant, length, opponentId, id);
    }
    this.queues.set(key, [...waiting, id]);
    conn.send({ t: "queued", variant, length });
  }

  private createInvite(conn: Conn, id: string, variant: MatchVariantId, length: number): void {
    if (this.busy(conn, id)) return;
    this.removeFromQueues(id);
    this.removeInvites(id);
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
    this.startMatch(invite.variant, invite.length, invite.hostId, id);
  }

  private startMatch(variant: MatchVariantId, length: number, a: string, b: string): void {
    const { store, timings, log } = this.opts;
    const swap = this.opts.randomSeats !== false && randomInt(2) === 1;
    const ids: [string, string] = swap ? [b, a] : [a, b];
    const room = new MatchRoom(
      variant,
      configFor(variant, length),
      [store.publicPlayer(ids[0], variant), store.publicPlayer(ids[1], variant)],
      {
        timings,
        log,
        onEnd: (r, result) => {
          for (const s of r.seats)
            if (this.roomByPlayer.get(s.player.id) === r) this.roomByPlayer.delete(s.player.id);
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
    log?.(`match ${room.id} started: ${variant}/${length}`);
    room.start();
  }

  private removeFromQueues(id: string): void {
    for (const [key, list] of this.queues) {
      if (list.includes(id))
        this.queues.set(
          key,
          list.filter((p) => p !== id),
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

  /** Stops all rooms (server shutdown). */
  dispose(): void {
    for (const room of new Set(this.roomByPlayer.values())) room.dispose();
    this.roomByPlayer.clear();
  }
}
