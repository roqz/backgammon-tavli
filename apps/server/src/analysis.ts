import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { analyseTurn } from "@tavli/ai";
import {
  applyAction,
  canConfirm,
  createGame,
  type GameAction,
  type GameState,
  type Player,
  type VariantId,
} from "@tavli/engine";
import type { StoredGame } from "./db";

/**
 * Fair-play analysis of a finished match: every non-forced checker decision of each player is
 * compared with the strong bot (agreement) and valued at 1 ply (error in points). Someone who
 * lets the bot play for them agrees almost always; in self-play the medium bot agrees 70–88 %,
 * the easy bot 24–34 %.
 */
export interface PlayerAnalysis {
  /** Non-forced checker decisions (at least two different resulting positions). */
  readonly decisions: number;
  /** Decisions identical to the strong bot. */
  readonly agree: number;
  /** Sum of equity lost against the best 1-ply move, in points. */
  readonly loss: number;
}

export type MatchAnalysis = [PlayerAnalysis, PlayerAnalysis];

const empty = (): { decisions: number; agree: number; loss: number } => ({ decisions: 0, agree: 0, loss: 0 });

/**
 * Replays the games turn by turn and analyses each move turn; yields after every analysed
 * turn so callers can spread the work (the analysis of one turn takes 50–200 ms).
 */
export function* analyseSteps(games: readonly StoredGame[]): Generator<void, MatchAnalysis> {
  const result = [empty(), empty()];
  for (const game of games) {
    const first = game.history.find((r) => r.kind === "move");
    if (!first) continue;
    let s: GameState = createGame({ variant: game.variant as VariantId, starter: first.player });
    const act = (a: GameAction) => {
      s = applyAction(s, a);
    };
    try {
      for (const rec of game.history) {
        switch (rec.kind) {
          case "move": {
            act({ type: "roll", dice: rec.dice });
            const start = s;
            for (const m of rec.moves) act({ type: "move", move: { from: m.from, to: m.to, die: m.die } });
            if (rec.moves.length > 0) {
              const a = analyseTurn(start, s.board);
              if (a) {
                const r = result[rec.player as Player]!;
                r.decisions++;
                if (a.agrees) r.agree++;
                r.loss += a.loss;
              }
              yield;
            }
            if (s.phase === "moving" && canConfirm(s)) act({ type: "confirm" });
            break;
          }
          case "double":
            act({ type: "double" });
            break;
          case "take":
            act({ type: "take" });
            break;
          case "drop":
            act({ type: "drop" });
            break;
          case "closed-out":
            act({ type: "pass" });
            break;
          case "resign":
            act({ type: "resign", player: rec.player, level: rec.level });
            break;
        }
        if (s.phase === "finished") break;
      }
    } catch {
      // A history that cannot be replayed (should not happen) only ends this game's analysis.
    }
  }
  return [result[0]!, result[1]!];
}

/** Synchronous analysis (worker thread, tests). */
export const analyseMatch = (games: readonly StoredGame[]): MatchAnalysis => {
  const steps = analyseSteps(games);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
};

export type AnalysisMode = "worker" | "inline" | "off";

/**
 * Runs match analyses one after another, either in a worker thread (production bundle, keeps
 * the game server responsive) or inline in small steps (development and tests).
 */
export class Analyzer {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (r: MatchAnalysis | null) => void>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private mode: AnalysisMode,
    private readonly log: (msg: string) => void = () => {},
  ) {
    if (mode === "worker") {
      const file = fileURLToPath(new URL("./analysis-worker.js", import.meta.url));
      if (!existsSync(file)) this.mode = "inline";
      else this.startWorker(file);
    }
  }

  private startWorker(file: string): void {
    const worker = new Worker(file);
    worker.unref();
    worker.on("message", (msg: { id: number; result: MatchAnalysis | null }) => {
      this.pending.get(msg.id)?.(msg.result);
      this.pending.delete(msg.id);
    });
    worker.on("error", (e) => {
      this.log(`analysis worker failed: ${String(e)}; analysing inline`);
      this.worker = null;
      this.mode = "inline";
      for (const resolve of this.pending.values()) resolve(null);
      this.pending.clear();
    });
    this.worker = worker;
  }

  /** Analyses a match; resolves to null when analysis is off or failed. */
  analyse(games: readonly StoredGame[]): Promise<MatchAnalysis | null> {
    if (this.mode === "off") return Promise.resolve(null);
    if (this.mode === "worker" && this.worker) {
      const id = this.nextId++;
      return new Promise((resolve) => {
        this.pending.set(id, resolve);
        this.worker!.postMessage({ id, games });
      });
    }
    const run = () =>
      new Promise<MatchAnalysis | null>((resolve) => {
        const steps = analyseSteps(games);
        const step = () => {
          try {
            const r = steps.next();
            if (r.done) resolve(r.value);
            else setImmediate(step);
          } catch (e) {
            this.log(`analysis failed: ${String(e)}`);
            resolve(null);
          }
        };
        step();
      });
    const next = this.chain.then(run);
    this.chain = next;
    return next;
  }

  async close(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
