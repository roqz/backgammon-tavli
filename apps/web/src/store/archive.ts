import type { GameResult, TurnRecord, VariantId } from "@tavli/engine";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerInfo } from "./game";

/** A finished game, kept locally for statistics and replays. */
export interface GameRecord {
  readonly id: string;
  /** ISO timestamp of the end of the game. */
  readonly date: string;
  readonly variant: VariantId;
  readonly players: readonly [PlayerInfo, PlayerInfo];
  /** 0 = unlimited session. */
  readonly matchLength: number;
  readonly result: GameResult;
  readonly history: readonly TurnRecord[];
}

const MAX_RECORDS = 200;

interface ArchiveStore {
  records: readonly GameRecord[];
  add: (r: Omit<GameRecord, "id" | "date">) => void;
  clear: () => void;
}

export const useArchive = create<ArchiveStore>()(
  persist(
    (set) => ({
      records: [],
      add: (r) =>
        set((s) => ({
          records: [
            {
              ...r,
              id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              date: new Date().toISOString(),
            },
            ...s.records,
          ].slice(0, MAX_RECORDS),
        })),
      clear: () => set({ records: [] }),
    }),
    { name: "tavli.archive", version: 1 },
  ),
);
