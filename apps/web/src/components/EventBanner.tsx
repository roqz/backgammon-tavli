import {
  type GameState,
  getVariant,
  isClosedOut,
  legalMoves,
  moveGenerator,
  type Player,
} from "@tavli/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { THEMES } from "../board/themes";
import { useT } from "../i18n";
import { useGame } from "../store/game";
import { useSettings } from "../store/settings";

type Tone = "info" | "warn" | "action" | "good";

export interface GameEvent {
  readonly id: number;
  readonly title: string;
  readonly sub?: string;
  readonly player?: Player;
  readonly tone: Tone;
  /** Display time in ms. */
  readonly duration: number;
}

/** Time the 3D dice need to land; roll-related banners wait for it. */
export const DICE_LAND_MS = 1_100;
/** How long "no play" / "closed out" stay visible. */
export const BLOCKED_VISIBLE_MS = 2200;
/** Auto-passing on "no play" waits until the banner was readable. */
export const noPlayDelay = (dice3d: boolean) => (dice3d ? DICE_LAND_MS : 0) + BLOCKED_VISIBLE_MS;

const TONES: Record<Tone, string> = {
  info: "border-sky-400/50 bg-sky-950/85 text-sky-50",
  warn: "border-amber-400/70 bg-amber-950/90 text-amber-50",
  action: "border-rose-400/60 bg-rose-950/85 text-rose-50",
  good: "border-emerald-400/60 bg-emerald-950/85 text-emerald-50",
};

let nextId = 1;

/**
 * Derives notable game events (no play, only some dice playable, hits, doubles, cube actions,
 * opening roll) from state changes, so they can be announced to the player.
 */
function useGameEvents(): GameEvent | null {
  const t = useT();
  const match = useGame((s) => s.match);
  const players = useGame((s) => s.players);
  const openingSeq = useGame((s) => s.opening?.seq ?? 0);
  const opening = useGame((s) => s.opening);
  const [event, setEvent] = useState<GameEvent | null>(null);
  const dice3d = useSettings((s) => s.dice3d);
  const delayed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef<{ game: GameState | null; openingSeq: number; gameNo: number }>({
    game: null,
    openingSeq,
    gameNo: 0,
  });

  const game = match?.game ?? null;
  const gameNo = match?.results.length ?? 0;

  useEffect(() => {
    const before = prev.current;
    prev.current = { game, openingSeq, gameNo };
    if (!game || !match) return;
    const name = (p: Player) => players[p].name;
    /** Shows an event, optionally after a delay (roll-related events wait for the 3D dice). */
    const show = (e: Omit<GameEvent, "id">, delay = 0) => {
      if (delayed.current) clearTimeout(delayed.current);
      delayed.current = null;
      if (delay <= 0) setEvent({ ...e, id: nextId++ });
      else delayed.current = setTimeout(() => setEvent({ ...e, id: nextId++ }), delay);
    };
    const afterDice = dice3d ? DICE_LAND_MS : 0;
    const b = before.game;

    // New game of a match: announce Crawford.
    if (gameNo !== before.gameNo || (b === null && match.crawford === "crawford-game")) {
      if (match.crawford === "crawford-game" && game.phase !== "finished") {
        show({ title: t.crawford, sub: t.evNoDoubling, tone: "info", duration: 2600 });
      }
      return;
    }
    if (!b && isClosedOut(game)) {
      // e.g. a resumed game that starts with a closed-out turn
      show({
        title: t.evClosedOut,
        sub: `${name(game.turn)} · ${t.evClosedOutSub}`,
        player: game.turn,
        tone: "warn",
        duration: BLOCKED_VISIBLE_MS,
      });
      return;
    }
    if (!b || b === game) {
      if (openingSeq !== before.openingSeq && game.phase === "opening" && opening) {
        show(
          {
            title: t.evTie,
            sub: `${opening.dice[0]} : ${opening.dice[1]}`,
            tone: "info",
            duration: 1300,
          },
          afterDice,
        );
      }
      return;
    }

    if (b.phase === "opening" && game.phase !== "opening") {
      show(
        { title: t.evWonOpening, sub: name(game.turn), player: game.turn, tone: "info", duration: 1600 },
        afterDice,
      );
      return;
    }
    if (isClosedOut(game) && (b.turn !== game.turn || b.phase !== "rolling")) {
      show({
        title: t.evClosedOut,
        sub: `${name(game.turn)} · ${t.evClosedOutSub}`,
        player: game.turn,
        tone: "warn",
        duration: BLOCKED_VISIBLE_MS,
      });
      return;
    }
    if (game.phase === "cube-offered" && b.phase !== "cube-offered") {
      show({
        title: `${t.evDoubleTo} ${game.cube.value * 2}`,
        sub: name(game.turn),
        player: game.turn,
        tone: "action",
        duration: 2000,
      });
      return;
    }
    if (game.cube.value > b.cube.value && game.cube.owner !== null) {
      show({
        title: t.histTake,
        sub: name(game.cube.owner),
        player: game.cube.owner,
        tone: "good",
        duration: 1600,
      });
      return;
    }

    // A new roll was made.
    if (game.phase === "moving" && game.dice && game.dice !== b.dice) {
      const p = game.turn;
      const legal = legalMoves(game);
      if (legal.length === 0) {
        const blocked = game.board.bar[p] > 0;
        show(
          {
            title: t.noPlay,
            sub: `${name(p)} · ${blocked ? t.evBarBlocked : t.evAllBlocked}`,
            player: p,
            tone: "warn",
            duration: BLOCKED_VISIBLE_MS,
          },
          afterDice,
        );
        return;
      }
      const playable = moveGenerator(game.variant, p).maxPlayable(game.board, game.remaining);
      if (playable < game.remaining.length) {
        show(
          {
            title: t.evPartial.replace("{n}", String(playable)).replace("{m}", String(game.remaining.length)),
            sub: name(p),
            player: p,
            tone: "warn",
            duration: 2200,
          },
          afterDice,
        );
        return;
      }
      if (game.dice[0] === game.dice[1]) {
        show({ title: t.evDoubles, sub: name(p), player: p, tone: "info", duration: 1000 }, afterDice);
      }
      return;
    }

    // A checker was hit or pinned.
    if (game.played.length > b.played.length && game.played[game.played.length - 1]?.hit) {
      const pin = getVariant(game.variant).blots === "pin";
      show({
        title: pin ? t.evPinned : t.evHit,
        sub: name(game.turn),
        player: game.turn,
        tone: "action",
        duration: 1200,
      });
    }
  }, [game, match, players, openingSeq, opening, gameNo, t, dice3d]);

  useEffect(
    () => () => {
      if (delayed.current) clearTimeout(delayed.current);
    },
    [],
  );

  // Auto-hide.
  useEffect(() => {
    if (!event) return;
    const id = setTimeout(() => setEvent((e) => (e?.id === event.id ? null : e)), event.duration);
    return () => clearTimeout(id);
  }, [event]);

  return event;
}

/** Game-style announcement overlay, centred over the board. */
/**
 * @param placement "top": upper part of the board (landscape: the dice lie in the middle);
 *   "middle": on the bar (portrait board: the dice lie in the two halves).
 */
export function EventBanner({ placement = "top" }: { placement?: "top" | "middle" }) {
  const event = useGameEvents();
  const style = useSettings((s) => s.style);
  const look = event?.player !== undefined ? THEMES[style].checkers[event.player] : null;
  const dot = look
    ? look.fill.startsWith("url")
      ? event?.player === 0
        ? "#efe6d0"
        : "#3a2418"
      : look.fill
    : null;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center ${
        placement === "top" ? "top-[14%]" : "top-1/2 -translate-y-1/2"
      }`}
      aria-live="assertive"
    >
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className={`rounded-2xl border-2 px-6 py-3 text-center shadow-2xl backdrop-blur-sm ${TONES[event.tone]}`}
          >
            <div className="text-xl font-bold tracking-tight sm:text-2xl">{event.title}</div>
            {event.sub && (
              <div className="mt-1 flex items-center justify-center gap-2 text-sm opacity-90">
                {dot && look && (
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border-2"
                    style={{ background: dot, borderColor: look.edge }}
                  />
                )}
                {event.sub}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
