/**
 * Wire protocol for online play. All messages are JSON objects with a `t` discriminator.
 * Client messages are validated with zod on the server; server messages are trusted by the client.
 */
import type { Dice, MatchAction, MatchConfig, MatchState, Player, VariantId } from "@tavli/engine";
import { z } from "zod";

export const MATCH_VARIANTS = ["backgammon", "portes", "plakoto", "fevga", "tavli"] as const;
export type MatchVariantId = (typeof MATCH_VARIANTS)[number];
export const MATCH_LENGTHS = [1, 3, 5, 7] as const;

/** Knockout tournaments for 4, 8 or 16 players. */
export const TOURNAMENT_SIZES = [4, 8, 16] as const;
export const TOURNAMENT_NAME_MAX = 40;

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
  z.object({ type: z.literal("offer-resign"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ type: z.literal("accept-resign") }),
  z.object({ type: z.literal("reject-resign") }),
]);

/** Predefined quick messages; there is no free-text chat, so nothing needs moderating. */
export const EMOTES = ["hi", "gl", "gg", "nice", "lucky", "oops", "think", "thanks"] as const;
export type EmoteId = (typeof EMOTES)[number];
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
  /** Client contribution to the dice randomness, sent right after match-start. */
  z.object({ t: z.literal("seed"), value: z.string().regex(/^[0-9a-f]{16,64}$/) }),
  z.object({ t: z.literal("rematch-decline") }),
  /** Quick message to the opponent during a match. */
  z.object({ t: z.literal("emote"), id: z.enum(EMOTES) }),
  z.object({
    t: z.literal("tournament-create"),
    name: z.string().trim().min(1).max(TOURNAMENT_NAME_MAX),
    ...matchSetup,
    size: z.union([z.literal(4), z.literal(8), z.literal(16)]),
  }),
  z.object({ t: z.literal("tournament-join"), id: z.string().min(1).max(64) }),
  /** Leave an open tournament, or withdraw from a running one (remaining matches are walkovers). */
  z.object({ t: z.literal("tournament-leave"), id: z.string().min(1).max(64) }),
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
      readonly fairness: FairnessCommit;
      /** Set when this is a tournament match. */
      readonly tournament: TournamentRef | null;
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
      /** Server seed and all rolls, to verify the dice. */
      readonly fairness: FairnessReveal;
    }
  /** The opponent wants a rematch. */
  | { readonly t: "rematch-offer" }
  /** The opponent declined or left; no rematch possible. */
  | { readonly t: "rematch-declined" }
  /** A tournament the player takes part in has changed (also sent after create/join). */
  | { readonly t: "tournament"; readonly tournament: TournamentView }
  /** A quick message from a seat (also echoed to the sender). */
  | { readonly t: "emote"; readonly seat: Player; readonly id: EmoteId }
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

export const REPORT_REASONS = ["cheating", "abuse", "stalling", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ReportSchema = z.object({
  playerId: z.string().min(1).max(64),
  matchId: z.string().min(1).max(64).optional(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).optional(),
});

export const BanSchema = z.object({
  /** null lifts the ban. */
  reason: z.string().trim().min(1).max(200).nullable(),
});

export const ResolveSchema = z.object({ resolution: z.string().trim().min(1).max(200) });

/** A report as moderators see it. */
export interface AdminReport {
  readonly id: number;
  readonly reporter: { readonly id: string; readonly name: string };
  readonly reported: { readonly id: string; readonly name: string; readonly banned: boolean };
  readonly reportsAgainst: number;
  readonly matchId: string | null;
  readonly reason: string;
  readonly note: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolution: string | null;
}

export interface ModerationInfo {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly createdAt: string;
  readonly bannedAt: string | null;
  readonly banReason: string | null;
  readonly reportsAgainst: number;
  readonly reportsFiled: number;
  readonly matches: number;
  /** Matches lost by forfeit or abandonment. */
  readonly forfeits: number;
  /** Comparison of the player's checker play with the strong bot (last 90 days). */
  readonly analysis: AnalysisSummary | null;
}

export interface AnalysisSummary {
  /** Non-forced checker decisions analysed. */
  readonly decisions: number;
  /** Share of decisions identical to the strong bot (0..1). */
  readonly agreement: number;
  /** Average equity lost per decision against the best 1-ply move, in points. */
  readonly averageLoss: number;
}

/** Fair-play signals for moderators – hints to look closer, never automatic penalties. */
export interface ModerationSignals {
  /** Checker play almost identical to the strong bot over many decisions. */
  readonly botLike: readonly (AnalysisSummary & { readonly player: PublicPlayerRef })[];
  /** Many matches lost by leaving or timing out. */
  readonly forfeits: readonly {
    readonly player: PublicPlayerRef;
    readonly matches: number;
    readonly forfeits: number;
  }[];
  /** Repeated cheap losses (forfeit, early resignation) to the same opponent in rated matches. */
  readonly dumping: readonly {
    readonly loser: PublicPlayerRef;
    readonly winner: PublicPlayerRef;
    readonly matches: number;
  }[];
  readonly thresholds: {
    readonly botLikeDecisions: number;
    readonly botLikeAgreement: number;
    readonly forfeitMatches: number;
    readonly forfeitRate: number;
    readonly dumpingMatches: number;
    readonly days: number;
  };
}

export interface PublicPlayerRef {
  readonly id: string;
  readonly name: string;
  readonly banned: boolean;
}

// ---- tournaments --------------------------------------------------------------------------------

export type TournamentStatus = "open" | "running" | "finished" | "cancelled";

export interface TournamentRef {
  readonly id: string;
  readonly name: string;
  /** 0-based round of this match. */
  readonly round: number;
  readonly rounds: number;
}

export interface TournamentPlayer extends PublicPlayer {
  /** 1 = best seed; null while the tournament is open. */
  readonly seed: number | null;
  readonly withdrawn: boolean;
}

export interface TournamentMatchView {
  readonly round: number;
  readonly slot: number;
  /** Player ids (null = not decided yet). */
  readonly players: readonly [string | null, string | null];
  /** waiting: players not known yet · ready: waiting for both to be online · playing · done */
  readonly status: "waiting" | "ready" | "playing" | "done";
  readonly winner: string | null;
  readonly matchId: string | null;
  readonly score: readonly [number, number] | null;
  /** Decided without play (opponent absent or withdrawn). */
  readonly walkover: boolean;
}

export interface TournamentView {
  readonly id: string;
  readonly name: string;
  readonly variant: MatchVariantId;
  readonly length: number;
  readonly size: number;
  readonly status: TournamentStatus;
  readonly createdBy: { readonly id: string; readonly name: string };
  readonly createdAt: string;
  readonly players: readonly TournamentPlayer[];
  /** rounds[r][slot]; empty while open. */
  readonly rounds: readonly (readonly TournamentMatchView[])[];
  readonly winner: string | null;
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
  readonly fairness?: FairnessReveal | null;
}

// ---- provably fair dice ------------------------------------------------------------------------
//
// The server commits to a secret seed (sends sha256(seed) at match start), both clients then send
// a random seed of their own, and every roll is derived as
//   HMAC-SHA256(key = serverSeed, message = "<clientSeed0>:<clientSeed1>:<rollIndex>")
// At the end of the match the server reveals its seed and all rolls, so clients can verify that
// no roll was chosen or changed by the server.

export interface FairnessCommit {
  /** Hex sha256 of the server seed. */
  readonly commit: string;
}

export interface FairnessReveal extends FairnessCommit {
  /** Hex server seed. */
  readonly serverSeed: string;
  readonly clientSeeds: readonly [string, string];
  /** Every roll of the match in order (opening rolls, re-rolled ties and timeout rolls included). */
  readonly rolls: readonly (readonly [number, number])[];
}

export const fairRollMessage = (clientSeeds: readonly [string, string], index: number, extra = ""): string =>
  `${clientSeeds[0]}:${clientSeeds[1]}:${index}${extra}`;

/**
 * Maps digest bytes to two dice without bias (bytes >= 252 are skipped).
 * Returns null in the astronomically unlikely case that fewer than two bytes qualify.
 */
export const diceFromDigest = (bytes: Uint8Array): [number, number] | null => {
  const out: number[] = [];
  for (const b of bytes) {
    if (b >= 252) continue;
    out.push((b % 6) + 1);
    if (out.length === 2) return [out[0]!, out[1]!];
  }
  return null;
};

export const SeedSchema = z.string().regex(/^[0-9a-f]{16,64}$/);
