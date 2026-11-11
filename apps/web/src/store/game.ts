import {
  applyMatchAction,
  createMatch,
  cryptoRng,
  type GameState,
  type MatchAction,
  type MatchConfig,
  type MatchState,
  type Move,
  type PlayedMove,
  rollDice,
} from "@tavli/engine";
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

export interface PlayerInfo {
  readonly name: string;
  readonly kind: "human" | "bot";
}

interface GameStore {
  match: MatchState | null;
  players: readonly [PlayerInfo, PlayerInfo];
  layout: Layout;
  opening: OpeningRoll | null;
  /** True while a multi-step move is being animated; blocks input. */
  busy: boolean;
  startMatch: (config: MatchConfig, players: readonly [PlayerInfo, PlayerInfo]) => void;
  dispatch: (action: MatchAction) => void;
  roll: () => void;
  playChain: (chain: readonly Move[]) => Promise<void>;
  leave: () => void;
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

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      match: null,
      players: [
        { name: "Weiß", kind: "human" },
        { name: "Schwarz", kind: "human" },
      ],
      layout: {},
      opening: null,
      busy: false,

      startMatch: (config, players) => {
        const match = createMatch(config);
        set({ match, players, layout: layoutFromBoard(match.game.board), opening: null, busy: false });
      },

      dispatch: (action) => {
        const { match, layout } = get();
        if (!match) return;
        const after = applyMatchAction(match, action);
        set({ match: after, layout: nextLayout(layout, match.game, after.game, action) });
      },

      roll: () => {
        const { match, opening } = get();
        if (!match) return;
        const dice = rollDice(cryptoRng);
        if (match.game.phase === "opening") set({ opening: { dice, seq: (opening?.seq ?? 0) + 1 } });
        get().dispatch({ type: "roll", dice });
      },

      playChain: async (chain) => {
        if (get().busy) return;
        set({ busy: true });
        try {
          for (let i = 0; i < chain.length; i++) {
            if (i > 0) await sleep(STEP_DELAY_MS);
            get().dispatch({ type: "move", move: chain[i]! });
          }
        } finally {
          set({ busy: false });
        }
      },

      leave: () => set({ match: null, layout: {}, opening: null }),
    }),
    {
      name: "tavli.game",
      version: 1,
      partialize: (s) => ({ match: s.match, players: s.players }),
      onRehydrateStorage: () => (state) => {
        if (state?.match) useGame.setState({ layout: layoutFromBoard(state.match.game.board) });
      },
    },
  ),
);
