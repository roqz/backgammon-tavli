import { createMatch } from "@tavli/engine";
import type {
  AccountResponse,
  ClientAction,
  ClientMessage,
  ClubSummary,
  ClubView,
  CORR_DAYS,
  CorrHours,
  CorrSeek,
  CorrView,
  EmoteId,
  Frame,
  FriendView,
  LEAGUE_DIVISIONS,
  LEAGUE_WEEKS,
  LeaderboardEntry,
  LeagueMode,
  LeagueView,
  LiveMatch,
  MatchDetailResponse,
  MatchVariantId,
  ProfileResponse,
  Progress,
  RatingPool,
  RegisterResponse,
  ReportReason,
  ServerMessage,
  TimeControl,
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

/** 0 = money session. */
export type MatchLength = 0 | 1 | 3 | 5 | 7;

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
      // A started match ends open challenges and watching.
      if (online.outgoing || online.incoming) set({ outgoing: null, incoming: null });
      if (online.watch) {
        send({ t: "unwatch" });
        set({ watch: null });
      }
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
          clock: null,
          timeControl: msg.timeControl ?? "relaxed",
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
      if (info)
        set({
          match: {
            ...info,
            deadline: msg.deadline,
            clock: msg.clock,
            clockOffset: msg.serverTime - Date.now(),
          },
        });
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
    case "watch-state": {
      const prev = online.watch;
      set({
        watch: {
          ...msg,
          clockOffset: msg.serverTime - Date.now(),
          end: prev?.matchId === msg.matchId ? prev.end : null,
        },
      });
      break;
    }
    case "watch-end": {
      const w = online.watch;
      if (w?.matchId === msg.matchId)
        set({
          watch: { ...w, deadline: null, end: { winner: msg.winner, reason: msg.reason, score: msg.score } },
        });
      break;
    }
    case "challenge":
      set({
        incoming: {
          id: msg.id,
          from: msg.from,
          variant: msg.variant,
          length: msg.length,
          clock: msg.clock ?? "relaxed",
        },
      });
      break;
    case "challenge-update": {
      if (online.incoming?.id === msg.id) set({ incoming: null });
      if (
        msg.status === "sent" ||
        msg.status === "notified" ||
        online.outgoing?.id === msg.id ||
        msg.id === ""
      )
        set({ outgoing: { id: msg.id, to: msg.to, status: msg.status } });
      break;
    }
    case "corr-changed":
      set({ corrVersion: online.corrVersion + 1 });
      break;
    case "friends-changed":
      set({ friendsVersion: online.friendsVersion + 1 });
      break;
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
    if (e.code === 4004) {
      set({ status: "offline", profile: null, lastError: "deleted" });
      wanted = false;
      return;
    }
    if (e.code === 4029) {
      set({ status: "offline", lastError: "too many connections" });
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

export const queue = (variant: MatchVariantId, length: MatchLength, clock: TimeControl = "relaxed") =>
  send({ t: "queue", variant, length, clock });
export const unqueue = () => send({ t: "unqueue" });
export const createInvite = (variant: MatchVariantId, length: MatchLength, clock: TimeControl = "relaxed") =>
  send({ t: "create", variant, length, clock });
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
  length: Exclude<MatchLength, 0>,
  size: 4 | 8 | 16,
  format: TournamentFormat = "knockout",
  clubId?: string,
  clock: TimeControl = "relaxed",
  startsAt: number | null = null,
) =>
  send({
    t: "tournament-create",
    name,
    variant,
    length,
    size,
    format,
    clock,
    ...(clubId ? { clubId } : {}),
    ...(startsAt ? { startsAt } : {}),
  });
export const joinTournament = (id: string) => send({ t: "tournament-join", id });

// ---- friends and spectating -------------------------------------------------------------------

export const fetchFriends = () => rest<FriendView[]>("/api/friends");
export const addFriend = (playerId: string) =>
  rest<{ result: "requested" | "accepted" | "already" }>("/api/friends", {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
export const removeFriend = (playerId: string) =>
  rest("/api/friends/remove", { method: "POST", body: JSON.stringify({ playerId }) });
export const fetchLive = () => rest<LiveMatch[]>("/api/live");

// ---- clubs and leagues ------------------------------------------------------------------------

export const fetchClubs = (query = "") =>
  rest<ClubSummary[]>(`/api/clubs${query ? `?q=${encodeURIComponent(query)}` : ""}`);
export const fetchClub = (id: string) => rest<ClubView>(`/api/clubs/${id}`);
export const createClub = (name: string, description: string, open: boolean) =>
  rest<ClubView>("/api/clubs", { method: "POST", body: JSON.stringify({ name, description, open }) });
export const joinClub = (id: string) => rest<ClubView>(`/api/clubs/${id}/join`, { method: "POST" });
export const leaveClub = (id: string) => rest(`/api/clubs/${id}/leave`, { method: "POST" });
export const manageMember = (
  id: string,
  playerId: string,
  action: "approve" | "remove" | "promote" | "demote",
) =>
  rest<ClubView>(`/api/clubs/${id}/manage`, { method: "POST", body: JSON.stringify({ playerId, action }) });
export const createLeague = (
  clubId: string,
  name: string,
  variant: MatchVariantId,
  length: Exclude<MatchLength, 0>,
  weeks: (typeof LEAGUE_WEEKS)[number],
  mode: LeagueMode = "live",
  days: (typeof CORR_DAYS)[number] = 3,
  divisions: (typeof LEAGUE_DIVISIONS)[number] = 1,
  clock: TimeControl = "relaxed",
  startsAt: number | null = null,
) =>
  rest<LeagueView>(`/api/clubs/${clubId}/leagues`, {
    method: "POST",
    body: JSON.stringify({
      name,
      variant,
      length,
      weeks,
      mode,
      days,
      divisions,
      clock,
      ...(startsAt ? { startsAt } : {}),
    }),
  });
export const fetchLeague = (id: string) => rest<LeagueView>(`/api/leagues/${id}`);
export const leagueAction = (id: string, action: "join" | "leave" | "start" | "next") =>
  rest<LeagueView>(`/api/leagues/${id}/${action}`, { method: "POST" });

// ---- correspondence games ---------------------------------------------------------------------

export const fetchCorrGames = () => rest<CorrView[]>("/api/corr");
export const fetchCorrGame = (id: string) => rest<CorrView>(`/api/corr/${id}`);
export const inviteCorr = (
  playerId: string,
  variant: MatchVariantId,
  length: MatchLength,
  hours: CorrHours,
) =>
  rest<CorrView>("/api/corr", { method: "POST", body: JSON.stringify({ playerId, variant, length, hours }) });
export const fetchCorrSeeks = () => rest<CorrSeek[]>("/api/corr/seeks");
/** Looks for an opponent: either a game starts right away or the search waits. */
export const seekCorr = (variant: MatchVariantId, length: MatchLength, hours: CorrHours) =>
  rest<{ game?: CorrView; seek?: CorrSeek }>("/api/corr/seeks", {
    method: "POST",
    body: JSON.stringify({ variant, length, hours }),
  });
export const cancelCorrSeek = (id: string) => rest(`/api/corr/seeks/${id}/cancel`, { method: "POST" });
export const answerCorr = (id: string, accept: boolean) =>
  rest<CorrView>(`/api/corr/${id}/answer`, { method: "POST", body: JSON.stringify({ accept }) });
export const corrAction = (id: string, action: ClientAction) =>
  rest<CorrView>(`/api/corr/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
export const abandonCorr = (id: string) => rest<CorrView>(`/api/corr/${id}/abandon`, { method: "POST" });

export const challengeFriend = (
  playerId: string,
  variant: MatchVariantId,
  length: MatchLength,
  opts: { leagueId?: string; clock?: TimeControl } = {},
) =>
  send({
    t: "challenge",
    playerId,
    variant,
    length,
    clock: opts.clock ?? "relaxed",
    ...(opts.leagueId ? { leagueId: opts.leagueId } : {}),
  });
export const answerChallenge = (id: string, accept: boolean) => {
  send({ t: "challenge-answer", id, accept });
  set({ incoming: null });
};
export const cancelChallenge = () => {
  const c = useOnline.getState().outgoing;
  if (c?.status === "sent") send({ t: "challenge-cancel", id: c.id });
  set({ outgoing: null });
};

export const watchMatch = (matchId: string) => {
  set({ watch: null });
  if (!send({ t: "watch", matchId })) set({ lastError: "not connected" });
};
export const stopWatching = () => {
  send({ t: "unwatch" });
  set({ watch: null });
};

/** Link that opens the app and offers to send a friend request to this player. */
export const friendLink = (playerId: string) => {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("friend", playerId);
  return url.toString();
};
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

/** Downloads everything the server stores about the player as a JSON file. */
export const exportData = async () => {
  const data = await rest<unknown>("/api/account/export");
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "tavli-data.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Ends the sessions of all other devices; returns how many. */
export const logoutOthers = async () =>
  (await rest<{ ended: number }>("/api/account/logout-all", { method: "POST" })).ended;

/** Deletes the profile on the server (accounts confirm with the password) and forgets it locally. */
export const deleteProfile = async (password?: string) => {
  await rest("/api/account/delete", { method: "POST", body: JSON.stringify(password ? { password } : {}) });
  disconnect();
  set({ profile: null, match: null, lobby: { kind: "idle" }, tournaments: {}, lastError: null });
  useGame.getState().endOnline();
};

export const changePassword = (oldPassword: string, newPassword: string) =>
  rest("/api/account/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });

export const fetchAccount = () => rest<AccountResponse>("/api/account");
export const setFrame = (frame: Frame | null) =>
  rest<AccountResponse>("/api/account/frame", { method: "POST", body: JSON.stringify({ frame }) });
/** Sends this device's achievements, lessons and puzzle results; returns the merged state. */
export const syncProgress = (progress: Progress) =>
  rest<Progress>("/api/account/progress", { method: "POST", body: JSON.stringify(progress) });
export const setFriendsCanWatch = (friendsCanWatch: boolean) =>
  rest<AccountResponse>("/api/account/settings", {
    method: "POST",
    body: JSON.stringify({ friendsCanWatch }),
  });

export const syncAccount = async () => {
  const acc = await rest<AccountResponse>("/api/account");
  const p = useOnline.getState().profile;
  if (p) set({ profile: { ...p, name: acc.name, username: acc.username } });
  return acc;
};
export const fetchLeaderboard = (variant: MatchVariantId, pool: RatingPool = "normal") =>
  rest<LeaderboardEntry[]>(`/api/leaderboard?variant=${variant}${pool === "normal" ? "" : `&pool=${pool}`}`);
