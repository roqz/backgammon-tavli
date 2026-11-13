import type { BotLevel } from "@tavli/ai";
import {
  applyMatchAction,
  createMatch,
  cryptoRng,
  type Dice,
  type GameState,
  type MatchAction,
  type MatchConfig,
  type MatchStart,
  type MatchState,
  type Move,
  type PlayedMove,
  type Player,
  rollDice,
} from "@tavli/engine";
import type { ClientAction } from "@tavli/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OpeningRoll } from "../board/Board";
import {
  applyMoveToLayout,
  type Layout,
  layoutFromBoard,
  layoutMatches,
  undoMoveInLayout,
} from "../board/layout";
import type { DiceThrow } from "../dice3d/Dice3D";
import { useArchive } from "./archive";

export interface PlayerInfo {
  readonly name: string;
  /** `remote` = online opponent. */
  readonly kind: "human" | "bot" | "remote";
  /** Strength when `kind` is `bot`. */
  readonly level?: BotLevel;
}

/** Sends actions to the game server while an online match is active. */
let remoteSender: ((action: ClientAction) => void) | null = null;
export const setRemoteSender = (fn: ((action: ClientAction) => void) | null) => {
  remoteSender = fn;
};

const toClientAction = (a: MatchAction): ClientAction | null => {
  switch (a.type) {
    case "roll":
      return { type: "roll" };
    case "resign":
      return { type: "resign", level: a.level };
    case "offer-resign":
      return { type: "offer-resign", level: a.level };
    case "next-game":
      return null; // the server starts the next game itself
    default:
      return a;
  }
};

interface GameStore {
  /** `online`: the server is authoritative, local actions are only requests. */
  mode: "local" | "online";
  /** The local match put aside while playing online. */
  savedLocal: { match: MatchState | null; players: readonly [PlayerInfo, PlayerInfo] } | null;
  match: MatchState | null;
  players: readonly [PlayerInfo, PlayerInfo];
  layout: Layout;
  opening: OpeningRoll | null;
  /** Latest throw for the 3D dice animation. */
  rollFx: DiceThrow | null;
  /** True while a multi-step move is being animated; blocks input. */
  busy: boolean;
  /** `start` begins from a given game and score (e.g. an imported XGID position). */
  startMatch: (config: MatchConfig, players: readonly [PlayerInfo, PlayerInfo], start?: MatchStart) => void;
  dispatch: (action: MatchAction) => void;
  roll: () => void;
  /** Plays moves one after another so each step animates; `stepDelay` in ms. */
  playChain: (chain: readonly Move[], stepDelay?: number) => Promise<void>;
  leave: () => void;
  startOnline: (match: MatchState, players: readonly [PlayerInfo, PlayerInfo]) => void;
  /** Applies a state pushed by the server, animating the action that led to it. */
  applyRemote: (
    match: MatchState,
    action: MatchAction | null,
    by: Player | null,
    opening: Dice | null,
  ) => void;
  endOnline: () => void;
}

const STEP_DELAY_MS = 230;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The move that was just played, whether the game continues or has just ended. */
const lastPlayed = (g: GameState): PlayedMove | undefined => {
  if (g.played.length > 0 && g.phase !== "finished") return g.played[g.played.length - 1];
  const rec = g.history[g.history.length - 1];
  return rec?.kind === "move" ? rec.moves[rec.moves.length - 1] : undefined;
};

const nextLayout = (layout: Layout, before: GameState, after: GameState, action: MatchAction): Layout => {
  let next = layout;
  if (action.type === "move") {
    const m = lastPlayed(after);
    if (m) next = applyMoveToLayout(layout, after.variant, before.turn, m);
  } else if (action.type === "undo") {
    const m = before.played[before.played.length - 1];
    if (m) next = undoMoveInLayout(layout, before.variant, before.turn, m);
  } else if (action.type === "next-game") {
    next = layoutFromBoard(after.board);
  }
  return layoutMatches(next, after.board) ? next : layoutFromBoard(after.board);
};

/** Dice animation descriptor for a throw. */
const throwFor = (prev: DiceThrow | null, dice: Dice, isOpening: boolean, half: Player): DiceThrow => ({
  seq: (prev?.seq ?? 0) + 1,
  dice: isOpening
    ? [
        { value: dice[0], half: 0 },
        { value: dice[1], half: 1 },
      ]
    : [
        { value: dice[0], half },
        { value: dice[1], half },
      ],
});

const archiveIfFinished = (
  before: MatchState,
  after: MatchState,
  players: readonly [PlayerInfo, PlayerInfo],
) => {
  const result = after.game.result;
  if (!result || before.game.result) return;
  useArchive.getState().add({
    variant: after.game.variant,
    players,
    matchLength: after.config.length,
    result,
    history: after.game.history,
  });
};

/** Highest cube value in games against the computer. */
export const BOT_CUBE_LIMIT = 64;

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      mode: "local",
      savedLocal: null,
      match: null,
      players: [
        { name: "Weiß", kind: "human" },
        { name: "Schwarz", kind: "human" },
      ],
      layout: {},
      opening: null,
      rollFx: null,
      busy: false,

      startMatch: (requested, players, start) => {
        // against the computer the cube stops at 64 (no endless cube wars)
        const vsBot = players.some((p) => p.kind === "bot");
        const config = vsBot ? { ...requested, cubeLimit: BOT_CUBE_LIMIT } : requested;
        const game = start?.game;
        const match = createMatch(
          config,
          vsBot && game
            ? { ...start, game: { ...game, cube: { ...game.cube, limit: BOT_CUBE_LIMIT } } }
            : start,
        );
        set({
          mode: "local",
          match,
          players,
          layout: layoutFromBoard(match.game.board),
          opening: null,
          busy: false,
        });
      },

      dispatch: (action) => {
        const { match, layout, mode } = get();
        if (!match) return;
        if (mode === "online") {
          const remote = toClientAction(action);
          if (remote) remoteSender?.(remote);
          return;
        }
        const after = applyMatchAction(match, action);
        set({ match: after, layout: nextLayout(layout, match.game, after.game, action) });
        archiveIfFinished(match, after, get().players);
      },

      roll: () => {
        const { match, opening, mode } = get();
        if (!match) return;
        if (mode === "online") {
          remoteSender?.({ type: "roll" });
          return;
        }
        const dice = rollDice(cryptoRng);
        const isOpening = match.game.phase === "opening";
        if (isOpening) set({ opening: { dice, seq: (opening?.seq ?? 0) + 1 } });
        const half = match.game.turn;
        set((s) => ({ rollFx: throwFor(s.rollFx, dice, isOpening, half) }));
        get().dispatch({ type: "roll", dice });
      },

      playChain: async (chain, stepDelay = STEP_DELAY_MS) => {
        if (get().busy) return;
        set({ busy: true });
        try {
          for (let i = 0; i < chain.length; i++) {
            if (i > 0) await sleep(stepDelay);
            get().dispatch({ type: "move", move: chain[i]! });
          }
        } finally {
          set({ busy: false });
        }
      },

      leave: () => set({ match: null, layout: {}, opening: null }),

      startOnline: (match, players) => {
        const s = get();
        set({
          savedLocal: s.mode === "local" ? { match: s.match, players: s.players } : s.savedLocal,
          mode: "online",
          match,
          players,
          layout: layoutFromBoard(match.game.board),
          opening: null,
          busy: false,
        });
      },

      applyRemote: (match, action, by, opening) => {
        const s = get();
        if (s.mode !== "online") return;
        const before = s.match;
        const patch: Partial<GameStore> = { match };
        if (opening) {
          patch.opening = { dice: opening, seq: (s.opening?.seq ?? 0) + 1 };
          patch.rollFx = throwFor(s.rollFx, opening, true, 0);
        } else if (action?.type === "roll" && by !== null) {
          patch.rollFx = throwFor(s.rollFx, action.dice, false, by);
        }
        const sameGame = before && before.results.length === match.results.length;
        patch.layout =
          before && sameGame && action
            ? nextLayout(s.layout, before.game, match.game, action)
            : layoutFromBoard(match.game.board);
        set(patch);
        if (before && sameGame) archiveIfFinished(before, match, s.players);
      },

      endOnline: () => {
        const { savedLocal } = get();
        set({
          mode: "local",
          savedLocal: null,
          match: savedLocal?.match ?? null,
          players: savedLocal?.players ?? get().players,
          layout: savedLocal?.match ? layoutFromBoard(savedLocal.match.game.board) : {},
          opening: null,
          busy: false,
        });
      },
    }),
    {
      name: "tavli.game",
      version: 1,
      // Online matches live on the server; only the local match is persisted.
      partialize: (s) =>
        s.mode === "online"
          ? { match: s.savedLocal?.match ?? null, players: s.savedLocal?.players ?? s.players }
          : { match: s.match, players: s.players },
      // Rebuild the checker identities from the restored board while merging (the store itself
      // is not available yet during synchronous hydration).
      merge: (persisted, current) => {
        const p = persisted as Partial<GameStore> | undefined;
        const match = p?.match ?? null;
        return { ...current, ...p, layout: match ? layoutFromBoard(match.game.board) : {} };
      },
    },
  ),
);
