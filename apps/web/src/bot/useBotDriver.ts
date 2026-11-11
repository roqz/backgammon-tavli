import type { MatchContext } from "@tavli/ai";
import { canConfirm, canDouble, isClosedOut, playerToAct } from "@tavli/engine";
import { useEffect, useState } from "react";
import { BLOCKED_VISIBLE_MS, noPlayDelay } from "../components/EventBanner";
import { useGame } from "../store/game";
import { useSettings } from "../store/settings";
import { askBot } from "./client";

const THINK_PAUSE_MS = 450;
const BOT_STEP_MS = 420;
const DICE_SETTLE_MS = 550;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lets computer players act whenever it is their turn: double or roll, choose and animate moves,
 * answer a double. Returns true while the bot is thinking.
 */
export function useBotDriver(): boolean {
  const match = useGame((s) => s.match);
  const players = useGame((s) => s.players);
  const busy = useGame((s) => s.busy);
  const [thinking, setThinking] = useState(false);

  const game = match?.game;
  const actor = game ? playerToAct(game) : null;
  const bot = actor !== null ? players[actor] : null;
  const botToAct = bot?.kind === "bot" && match?.winner === null && !busy;

  useEffect(() => {
    if (!botToAct || !match || !game || actor === null) return;
    const level = bot?.level ?? "medium";
    const ctx: MatchContext = { length: match.config.length, score: match.score, crawford: match.crawford };
    let cancelled = false;
    /** Only act if nobody changed the game while we were thinking. */
    const stillCurrent = () => !cancelled && useGame.getState().match?.game === game;
    const { dispatch, roll, playChain } = useGame.getState();

    const run = async () => {
      setThinking(true);
      try {
        await sleep(THINK_PAUSE_MS);
        if (!stillCurrent()) return;
        switch (game.phase) {
          case "rolling": {
            if (isClosedOut(game)) {
              await sleep(BLOCKED_VISIBLE_MS - THINK_PAUSE_MS);
              if (stillCurrent()) dispatch({ type: "pass" });
              break;
            }
            const double =
              canDouble(game) && (await askBot({ kind: "double", state: game, level, match: ctx }));
            if (!stillCurrent()) return;
            if (double) dispatch({ type: "double" });
            else roll();
            break;
          }
          case "cube-offered": {
            const take = await askBot({ kind: "take", state: game, level, match: ctx });
            if (stillCurrent()) dispatch({ type: take ? "take" : "drop" });
            break;
          }
          case "moving": {
            // Let the 3D dice land before the computer starts moving.
            if (useSettings.getState().dice3d) await sleep(DICE_SETTLE_MS);
            if (!stillCurrent()) return;
            const moves = await askBot({ kind: "moves", state: game, level });
            if (!stillCurrent()) return;
            setThinking(false);
            if (moves.length > 0) await playChain(moves, BOT_STEP_MS);
            else await sleep(noPlayDelay(useSettings.getState().dice3d)); // let the human read "no play"
            await sleep(350);
            const after = useGame.getState().match?.game;
            if (!cancelled && after?.phase === "moving" && after.turn === actor && canConfirm(after)) {
              dispatch({ type: "confirm" });
            }
            break;
          }
        }
      } catch (err) {
        console.error("Bot failed", err);
      } finally {
        setThinking(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [botToAct, game, actor, bot, match]);

  return thinking;
}

/**
 * The local human's colour when playing against the computer or an online opponent
 * (null in hotseat or bot-vs-bot).
 */
export const humanSeat = (players: readonly [{ kind: string }, { kind: string }]) => {
  const h0 = players[0].kind === "human";
  const h1 = players[1].kind === "human";
  if (h0 && !h1) return 0;
  if (h1 && !h0) return 1;
  return null;
};
