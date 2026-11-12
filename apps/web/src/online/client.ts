import { createMatch } from "@tavli/engine";
import type {
  AccountResponse,
  ClientMessage,
  EmoteId,
  LeaderboardEntry,
  MatchDetailResponse,
  MatchVariantId,
  ProfileResponse,
  RegisterResponse,
  ReportReason,
  ServerMessage,
  TournamentFormat,
  TournamentMatchView,
  TournamentView,
} from "@tavli/protocol";
import { DICTS } from "../i18n";
import { type PlayerInfo, setRemoteSender, useGame } from "../store/game";
import { useSettings } from "../store/settings";
import { newClientSeed, verifyDice } from "./fairness";
import { notifyIfHidden } from "./push";
import { httpUrl, useOnline, wsUrl } from "./store";

export type MatchLength = 1 | 3 | 5 | 7;

let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let wanted = false;

const set = (patch: Parameters<ReturnType<typeof useOnline.getState>["set"]>[0]) =>
  useOnline.getState().set(patch);

const send = (msg: ClientMessage): boolean => {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
};

const onMessage = (msg: ServerMessage) => {
  const online = useOnline.getState();
  switch (msg.t) {
    case "welcome": {
      retry = 0;
      set({ status: "ready", lastError: null });
      if (online.pendingJoin) {
        send({ t: "join", code: online.pendingJoin });
        set({ pendingJoin: null });
      }
      break;
    }
    case "queued":
      set({ lobby: { kind: "queued", variant: msg.variant, length: msg.length } });
      break;
    case "room-created":
      set({ lobby: { kind: "invite", code: msg.code, variant: msg.variant, length: msg.length } });
      break;
    case "unqueued":
      set({ lobby: { kind: "idle" } });
      break;
    case "match-start": {
      // Contribute to the dice randomness once per match (not again after a reconnect).
      const sameMatch = online.match?.matchId === msg.matchId;
      const seed = sameMatch ? null : newClientSeed();
      if (seed) send({ t: "seed", value: seed });
      const players = msg.players.map(
        (p, seat): PlayerInfo => ({ name: p.name, kind: seat === msg.seat ? "human" : "remote" }),
      ) as unknown as [PlayerInfo, PlayerInfo];
      set({
        lobby: { kind: "idle" },
        match: {
          matchId: msg.matchId,
          seat: msg.seat,
          players: msg.players,
          variant: msg.config.variant as MatchVariantId,
          length: msg.config.length,
          deadline: null,
          clockOffset: 0,
          opponentConnected: true,
          opponentGraceUntil: null,
          rated: msg.rated,
          fairCommit: msg.fairness.commit,
          mySeed: sameMatch ? (online.match?.mySeed ?? null) : seed,
          fairCheck: null,
          unratedReason: msg.unratedReason,
          rematch: "none",
          emote: null,
          tournament: msg.tournament ?? null,
          end: null,
        },
      });
      // A reconnect to the same match keeps the board; a new match starts fresh.
      const game = useGame.getState();
      if (game.mode !== "online" || online.match?.matchId !== msg.matchId) {
        // Placeholder until the first state message arrives right after.
        game.startOnline(createMatch(msg.config), players);
      }
      break;
    }
    case "state": {
      const info = online.match;
      if (info) set({ match: { ...info, deadline: msg.deadline, clockOffset: msg.serverTime - Date.now() } });
      useGame.getState().applyRemote(msg.match, msg.action, msg.by, msg.opening);
      break;
    }
    case "opponent": {
      const info = online.match;
      if (info)
        set({ match: { ...info, opponentConnected: msg.connected, opponentGraceUntil: msg.graceUntil } });
      break;
    }
    case "match-end": {
      const info = online.match;
      if (info) {
        set({
          match: {
            ...info,
            deadline: null,
            fairCheck: "pending",
            end: { winner: msg.winner, reason: msg.reason, ratingDelta: msg.ratingDelta },
          },
        });
        const game = useGame.getState().match?.game;
        void verifyDice(info.fairCommit, msg.fairness, info.mySeed, game ? [game.history] : [])
          .catch(() => false)
          .then((ok) => {
            const cur = useOnline.getState().match;
            if (cur?.matchId === info.matchId) set({ match: { ...cur, fairCheck: ok ? "ok" : "failed" } });
          });
      }
      break;
    }
    case "rematch-offer": {
      const info = online.match;
      if (info) set({ match: { ...info, rematch: info.rematch === "requested" ? "requested" : "offered" } });
      break;
    }
    case "rematch-declined": {
      const info = online.match;
      if (info) set({ match: { ...info, rematch: "declined" } });
      break;
    }
    case "tournament": {
      announceReadyMatch(online.tournaments[msg.tournament.id], msg.tournament, online.profile?.id);
      set({ tournaments: { ...online.tournaments, [msg.tournament.id]: msg.tournament } });
      break;
    }
    case "emote": {
      const info = online.match;
      if (info)
        set({ match: { ...info, emote: { seat: msg.seat, id: msg.id, seq: (info.emote?.seq ?? 0) + 1 } } });
      break;
    }
    case "error":
      set({ lastError: msg.message });
      break;
    case "pong":
      break;
  }
};

const scheduleReconnect = () => {
  if (!wanted || retryTimer) return;
  const delay = Math.min(15_000, 500 * 2 ** retry++);
  set({ status: "reconnecting" });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
};

/** Opens (or reuses) the connection to the game server and authenticates. */
export const connect = (): void => {
  const { serverUrl, profile } = useOnline.getState();
  if (!serverUrl || !profile) return;
  wanted = true;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  set({ status: retry > 0 ? "reconnecting" : "connecting" });
  const socket = new WebSocket(wsUrl(serverUrl));
  ws = socket;
  socket.onopen = () => {
    send({ t: "hello", playerId: profile.id, token: profile.token, deviceId: useOnline.getState().deviceId });
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ t: "ping" }), 25_000);
  };
  socket.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data as string) as ServerMessage);
    } catch (err) {
      console.error("bad server message", err);
    }
  };
  socket.onclose = (e) => {
    if (ws === socket) ws = null;
    if (pingTimer) clearInterval(pingTimer);
    if (e.code === 4001) {
      // unknown player (e.g. server database reset): forget the profile
      set({ status: "offline", profile: null, lastError: "unknown player" });
      wanted = false;
      return;
    }
    if (e.code === 4003) {
      set({ status: "offline", lastError: "banned" });
      wanted = false;
      return;
    }
    if (e.code === 4002) {
      set({ status: "offline", lastError: "replaced" });
      wanted = false;
      return;
    }
    set({ status: "offline" });
    scheduleReconnect();
  };
};

export const disconnect = (): void => {
  wanted = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  ws?.close();
  ws = null;
  set({ status: "offline" });
};

setRemoteSender((action) => {
  if (!send({ t: "action", action })) set({ lastError: "not connected" });
});

export const queue = (variant: MatchVariantId, length: MatchLength) => send({ t: "queue", variant, length });
export const unqueue = () => send({ t: "unqueue" });
export const createInvite = (variant: MatchVariantId, length: MatchLength) =>
  send({ t: "create", variant, length });
export const joinInvite = (code: string) => {
  if (!send({ t: "join", code })) {
    set({ pendingJoin: code });
    connect();
  }
};

/** Asks for (or accepts) a rematch with the same opponent and settings. */
export const requestRematch = () => {
  const info = useOnline.getState().match;
  if (!info?.end || !send({ t: "rematch" })) return;
  set({ match: { ...info, rematch: "requested" } });
};

export const sendEmote = (id: EmoteId) => send({ t: "emote", id });

/** Local notification (app open in a background tab) when the player's next match becomes ready. */
const announceReadyMatch = (
  before: TournamentView | undefined,
  after: TournamentView,
  me: string | undefined,
) => {
  if (!me) return;
  const key = (m: TournamentMatchView) => `${m.round}/${m.slot}`;
  const wasReady = new Set(
    (before?.rounds.flat() ?? []).filter((m) => m.status === "ready" && m.players.includes(me)).map(key),
  );
  const m = after.rounds
    .flat()
    .find((x) => x.status === "ready" && x.players.includes(me) && !wasReady.has(key(x)));
  if (!m) return;
  const t = DICTS[useSettings.getState().lang];
  const opponent = after.players.find((p) => p.id !== me && m.players.includes(p.id))?.name ?? "?";
  const body = t.tPushReady
    .replace("{round}", `${m.round + 1}/${after.roundCount}`)
    .replace("{name}", opponent);
  void notifyIfHidden(`🏆 ${after.name}`, body, `tournament-${after.id}`);
};

export const createTournament = (
  name: string,
  variant: MatchVariantId,
  length: MatchLength,
  size: 4 | 8 | 16,
  format: TournamentFormat = "knockout",
) => send({ t: "tournament-create", name, variant, length, size, format });
export const joinTournament = (id: string) => send({ t: "tournament-join", id });
export const leaveTournament = (id: string) => send({ t: "tournament-leave", id });
export const fetchTournaments = () => rest<TournamentView[]>("/api/tournaments");
export const fetchTournament = (id: string) => rest<TournamentView>(`/api/tournaments/${id}`);

/** Reports an opponent of a match to the moderators; resolves to false for a repeated report. */
export const reportPlayer = async (playerId: string, matchId: string, reason: ReportReason, note: string) => {
  const r = await rest<{ duplicate: boolean }>("/api/reports", {
    method: "POST",
    body: JSON.stringify({ playerId, matchId, reason, note: note.trim() || undefined }),
  });
  return !r.duplicate;
};

/** Leaves the online match (forfeits if it is still running) and returns to local play. */
export const leaveMatch = () => {
  const m = useOnline.getState().match;
  if (m && !m.end) send({ t: "leave" });
  if (m?.end) send({ t: "rematch-decline" });
  set({ match: null });
  useGame.getState().endOnline();
};

// ---- REST ---------------------------------------------------------------------------------------

const rest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const { serverUrl, profile } = useOnline.getState();
  const res = await fetch(httpUrl(serverUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(profile ? { Authorization: `Bearer ${profile.id}.${profile.token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok)
    throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return (await res.json()) as T;
};

export const register = async (name: string) => {
  const r = await rest<RegisterResponse>("/api/players", { method: "POST", body: JSON.stringify({ name }) });
  set({ profile: { id: r.id, token: r.token, name: r.name } });
  return r;
};

export const rename = async (name: string) => {
  await rest("/api/players/me", { method: "PATCH", body: JSON.stringify({ name }) });
  const p = useOnline.getState().profile;
  if (p) set({ profile: { ...p, name } });
};

export const fetchProfile = (id: string) => rest<ProfileResponse>(`/api/players/${id}`);
export const fetchMatch = (id: string) => rest<MatchDetailResponse>(`/api/matches/${id}`);

/** Turns the current guest profile into an account that can log in on other devices. */
export const claimAccount = async (username: string, password: string, email: string) => {
  const acc = await rest<AccountResponse>("/api/account/claim", {
    method: "POST",
    body: JSON.stringify({ username, password, email }),
  });
  const p = useOnline.getState().profile;
  if (p) set({ profile: { ...p, username: acc.username } });
  return acc;
};

/** Logs in on this device; replaces a local guest profile. */
export const login = async (username: string, password: string) => {
  const r = await rest<RegisterResponse>("/api/account/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  disconnect();
  set({ profile: { id: r.id, token: r.token, name: r.name, username }, lastError: null });
  connect();
  return r;
};

/** Logs out on this device: the session ends and the local profile is forgotten. */
export const logout = async () => {
  await rest("/api/account/logout", { method: "POST" }).catch(() => {});
  disconnect();
  set({ profile: null, match: null, lobby: { kind: "idle" } });
};

export const changePassword = (oldPassword: string, newPassword: string) =>
  rest("/api/account/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });

export const syncAccount = async () => {
  const acc = await rest<AccountResponse>("/api/account");
  const p = useOnline.getState().profile;
  if (p) set({ profile: { ...p, name: acc.name, username: acc.username } });
  return acc;
};
export const fetchLeaderboard = (variant: MatchVariantId) =>
  rest<LeaderboardEntry[]>(`/api/leaderboard?variant=${variant}`);
