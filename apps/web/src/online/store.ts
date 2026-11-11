import type { Player } from "@tavli/engine";
import type { MatchEndReason, MatchVariantId, PublicPlayer } from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Profile {
  readonly id: string;
  readonly token: string;
  readonly name: string;
}

export type ConnectionStatus = "offline" | "connecting" | "ready" | "reconnecting";

export type LobbyState =
  | { readonly kind: "idle" }
  | { readonly kind: "queued"; readonly variant: MatchVariantId; readonly length: number }
  | {
      readonly kind: "invite";
      readonly code: string;
      readonly variant: MatchVariantId;
      readonly length: number;
    };

export interface OnlineMatchInfo {
  readonly matchId: string;
  readonly seat: Player;
  readonly players: readonly [PublicPlayer, PublicPlayer];
  readonly variant: MatchVariantId;
  readonly length: number;
  deadline: number | null;
  opponentConnected: boolean;
  opponentGraceUntil: number | null;
  end: {
    readonly winner: Player;
    readonly reason: MatchEndReason;
    readonly ratingDelta: readonly [number, number];
  } | null;
}

/**
 * Default game server: build-time VITE_SERVER_URL ("same-origin" when app and server share a
 * domain behind a reverse proxy), otherwise the local dev server when running on localhost.
 */
const resolveDefaultServer = (): string => {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname);
  if (configured === "same-origin") return typeof location !== "undefined" ? location.origin : "";
  if (configured) return configured;
  return local ? "http://localhost:2567" : "";
};

export const DEFAULT_SERVER_URL: string = resolveDefaultServer();

interface OnlineStore {
  serverUrl: string;
  profile: Profile | null;
  status: ConnectionStatus;
  lobby: LobbyState;
  match: OnlineMatchInfo | null;
  lastError: string | null;
  /** Invite code from a link, joined as soon as the connection is ready. */
  pendingJoin: string | null;
  set: (patch: Partial<Omit<OnlineStore, "set">>) => void;
}

export const useOnline = create<OnlineStore>()(
  persist(
    (set) => ({
      serverUrl: DEFAULT_SERVER_URL,
      profile: null,
      status: "offline",
      lobby: { kind: "idle" },
      match: null,
      lastError: null,
      pendingJoin: null,
      set: (patch) => set(patch),
    }),
    {
      name: "tavli.online",
      version: 1,
      partialize: (s) => ({ serverUrl: s.serverUrl, profile: s.profile }),
    },
  ),
);

export const httpUrl = (server: string, path: string) => `${server.replace(/\/$/, "")}${path}`;
export const wsUrl = (server: string) => `${server.replace(/\/$/, "").replace(/^http/, "ws")}/ws`;
