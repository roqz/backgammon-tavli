/**
 * Wire protocol for online play. All messages are JSON objects with a `t` discriminator.
 * Client messages are validated with zod on the server; server messages are trusted by the client.
 */
import type { Dice, MatchAction, MatchConfig, MatchState, Player, VariantId } from "@tavli/engine";
import { z } from "zod";

export const MATCH_VARIANTS = ["backgammon", "portes", "plakoto", "fevga", "tavli"] as const;
export type MatchVariantId = (typeof MATCH_VARIANTS)[number];
export const MATCH_LENGTHS = [1, 3, 5, 7] as const;

export const NAME_MAX = 24;

// ---- client -> server -------------------------------------------------------------------------

const point = z.number().int().min(0).max(23);
const die = z.number().int().min(1).max(6);

/** Actions a client may request. Dice are never sent by clients: the server rolls. */
export const ClientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }),
  z.object({
    type: z.literal("move"),
    move: z.object({
      from: z.union([point, z.literal("bar")]),
      to: z.union([point, z.literal("off")]),
      die,
    }),
  }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("double") }),
  z.object({ type: z.literal("take") }),
  z.object({ type: z.literal("drop") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("resign"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
]);
export type ClientAction = z.infer<typeof ClientActionSchema>;

const matchSetup = {
  variant: z.enum(MATCH_VARIANTS),
  length: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
};

export const ClientMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    playerId: z.string().min(1).max(64),
    token: z.string().min(1).max(128),
    /** Random id stored per browser; used to keep one person from playing against themselves. */
    deviceId: z.string().min(8).max(64).optional(),
  }),
  z.object({ t: z.literal("queue"), ...matchSetup }),
  z.object({ t: z.literal("unqueue") }),
  z.object({ t: z.literal("create"), ...matchSetup }),
  z.object({ t: z.literal("join"), code: z.string().min(4).max(12) }),
  z.object({ t: z.literal("action"), action: ClientActionSchema }),
  /** Leave the current match (forfeit if it is still running). */
  z.object({ t: z.literal("leave") }),
  /** Ask for (or accept) a rematch after the match ended. */
  z.object({ t: z.literal("rematch") }),
  z.object({ t: z.literal("rematch-decline") }),
  z.object({ t: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---- server -> client -------------------------------------------------------------------------

export interface PublicPlayer {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
}

/** Why a match does not change ratings. */
export type UnratedReason = "same-device" | "same-network" | "repeat-opponent";

export type MatchEndReason = "won" | "forfeit" | "abandoned";

export type ServerMessage =
  | { readonly t: "welcome"; readonly player: PublicPlayer }
  | { readonly t: "queued"; readonly variant: MatchVariantId; readonly length: number }
  | { readonly t: "unqueued" }
  | {
      readonly t: "room-created";
      readonly code: string;
      readonly variant: MatchVariantId;
      readonly length: number;
    }
  | {
      readonly t: "match-start";
      readonly matchId: string;
      readonly seat: Player;
      readonly players: readonly [PublicPlayer, PublicPlayer];
      readonly config: MatchConfig;
      /** Whether the result will change ratings. */
      readonly rated: boolean;
      readonly unratedReason: UnratedReason | null;
    }
  | {
      readonly t: "state";
      readonly match: MatchState;
      /** The action that led to this state (for animations), with server-rolled dice. */
      readonly action: MatchAction | null;
      readonly by: Player | null;
      /** Dice of the decisive opening roll when a game just started. */
      readonly opening: Dice | null;
      /** Epoch ms when the player to act runs out of time (null = no clock). */
      readonly deadline: number | null;
      /** Server clock (epoch ms) when the message was sent, to correct client clock skew. */
      readonly serverTime: number;
    }
  | { readonly t: "opponent"; readonly connected: boolean; readonly graceUntil: number | null }
  | {
      readonly t: "match-end";
      readonly winner: Player;
      readonly reason: MatchEndReason;
      readonly score: readonly [number, number];
      /** Rating change per seat (0 when unrated). */
      readonly ratingDelta: readonly [number, number];
    }
  /** The opponent wants a rematch. */
  | { readonly t: "rematch-offer" }
  /** The opponent declined or left; no rematch possible. */
  | { readonly t: "rematch-declined" }
  | { readonly t: "error"; readonly message: string }
  | { readonly t: "pong" };

// ---- REST -------------------------------------------------------------------------------------

export interface RegisterResponse {
  readonly id: string;
  readonly token: string;
  readonly name: string;
}

export interface RatingEntry {
  readonly variant: MatchVariantId;
  readonly rating: number;
  readonly matches: number;
  readonly wins: number;
}

export interface LeaderboardEntry extends RatingEntry {
  readonly playerId: string;
  readonly name: string;
}

export interface MatchSummary {
  readonly id: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly players: readonly [PublicPlayer, PublicPlayer];
  readonly winner: Player;
  readonly score: readonly [number, number];
  readonly reason: MatchEndReason;
  readonly endedAt: string;
}

export interface ProfileResponse {
  readonly id: string;
  readonly name: string;
  readonly ratings: readonly RatingEntry[];
  readonly recent: readonly MatchSummary[];
}

export const NameSchema = z.object({ name: z.string().trim().min(1).max(NAME_MAX) });

export const encode = (m: ServerMessage | ClientMessage): string => JSON.stringify(m);

export const isVariantId = (v: string): v is VariantId =>
  v === "backgammon" || v === "portes" || v === "plakoto" || v === "fevga";

// ---- accounts ---------------------------------------------------------------------------------

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const PASSWORD_MIN = 8;

export const ClaimSchema = z.object({
  username: z.string().regex(USERNAME_PATTERN),
  password: z.string().min(PASSWORD_MIN).max(200),
  email: z.union([z.email().max(200), z.literal("")]).optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
});

export const PasswordChangeSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN).max(200),
});

export interface AccountResponse {
  readonly id: string;
  readonly name: string;
  /** null for guest profiles without login. */
  readonly username: string | null;
  readonly email: string | null;
}

export interface StoredGameResponse {
  readonly variant: VariantId;
  readonly history: readonly import("@tavli/engine").TurnRecord[];
  readonly result?: import("@tavli/engine").GameResult | null;
}

export interface MatchDetailResponse extends MatchSummary {
  readonly games: readonly StoredGameResponse[];
}
