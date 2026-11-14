import {
  applyMoveUnchecked,
  canBeaver,
  canConfirm,
  canDouble,
  canRaccoon,
  canUndo,
  formatTurn,
  type GameResult,
  type GameState,
  getVariant,
  isClosedOut,
  legalMoves,
  type Move,
  opponent,
  type PlayedMove,
  type Player,
  pipCount,
  playerToAct,
} from "@tavli/engine";
import type { ClockView, Frame } from "@tavli/protocol";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Board } from "../board/Board";
import { HEIGHT, WIDTH } from "../board/geometry";
import { layoutFromBoard, layoutMatches } from "../board/layout";
import { askBot } from "../bot/client";
import { humanSeat, useBotDriver } from "../bot/useBotDriver";
import { Fireworks } from "../components/AchievementLayer";
import { BLOCKED_VISIBLE_MS, EventBanner, noPlayDelay } from "../components/EventBanner";
import { PlayerName } from "../components/PlayerName";
import { Button, Modal } from "../components/ui";
import { errorText } from "../errors";
import { turnText, useT } from "../i18n";
import { leaveMatch, requestRematch } from "../online/client";
import { notifyIfHidden } from "../online/push";
import { useOnline } from "../online/store";
import { useBoardTheme, useFireworks } from "../rewards";
import { sounds, useGameSounds } from "../sound";
import { type GameRecord, useArchive } from "../store/archive";
import { useGame } from "../store/game";
import { useSettings } from "../store/settings";
import { AddFriendButton } from "./FriendsPanel";
import {
  EmoteBubbles,
  EmoteButton,
  ReportDialog,
  ResignDialog,
  ResignOfferPrompt,
  useResignRejected,
  XgidBox,
} from "./GameExtras";
import {
  ActionArea,
  FitBoard,
  fullscreenSupported,
  IconButton,
  MoreSheet,
  type PhoneAction,
  PhoneStage,
  PlayerBar,
  type PlayerInfo,
  type SheetItem,
  toggleFullscreen,
  useFullscreen,
  usePhoneLayout,
} from "./PhoneGame";
import { RulesDrawer } from "./RulesPanel";
import { SettingsDrawer } from "./SettingsPanel";
import { roundName } from "./TournamentPanel";

/** three.js is only loaded when the 3D dice are used. */
const Dice3D = lazy(() => import("../dice3d/Dice3D"));

type T = ReturnType<typeof useT>;

const levelName = (t: T, g: GameState, r: GameResult): string => {
  if (r.reason === "mana") return t.mana;
  if (r.reason === "drop") return t.byDrop;
  if (r.level === 3) return t.backgammon;
  if (r.level === 2) return g.variant === "backgammon" ? t.gammon : t.mars;
  return t.single;
};

export function Checker({ player }: { player: Player }) {
  const look = useBoardTheme().checkers[player];
  const fill = look.fill.startsWith("url") ? (player === 0 ? "#efe6d0" : "#3a2418") : look.fill;
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border-2"
      style={{ background: fill, borderColor: look.edge }}
      aria-hidden
    />
  );
}

interface Countdown {
  readonly kind: "roll" | "confirm";
  readonly seconds: number;
}

/**
 * Automatic actions for human players: opening roll, auto-roll (immediately, or after a
 * cancellable countdown when doubling is possible), passing on "no play" and auto-confirm
 * (optionally after a cancellable countdown).
 */
function useAutoActions(): { countdown: Countdown | null; cancel: () => void } {
  const { match, busy, roll, dispatch, opening, players } = useGame();
  const { autoRoll, autoRollCountdown, autoConfirm, autoConfirmDelay, dice3d, countdownSeconds } =
    useSettings();
  const COUNTDOWN_MS = countdownSeconds * 1000;
  const g = match?.game;
  // A tied opening roll leaves the game state unchanged, so the roll counter re-triggers the effect.
  const openingSeq = opening?.seq;
  // Computer players act on their own (see useBotDriver).
  const actor = g ? playerToAct(g) : null;
  const humanTurn = actor !== null && players[actor].kind === "human";
  const [cancelledFor, setCancelledFor] = useState<GameState | null>(null);
  const [pending, setPending] = useState<{ kind: Countdown["kind"]; at: number; game: GameState } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  // biome-ignore lint/correctness/useExhaustiveDependencies: openingSeq is an intentional trigger
  useEffect(() => {
    setPending(null);
    if (!g || busy || match?.winner !== null || g.resignOffer) return;
    if (g.phase !== "opening" && !humanTurn) return;
    if (cancelledFor === g) return;
    let delay = -1;
    let act: () => void = () => {};
    let countdown: Countdown["kind"] | null = null;
    if (isClosedOut(g)) {
      // Nothing to decide: skip the turn once the "closed out" banner was readable.
      delay = BLOCKED_VISIBLE_MS;
      act = () => dispatch({ type: "pass" });
    } else if (g.phase === "opening" && autoRoll) {
      delay = 700;
      act = roll;
    } else if (g.phase === "rolling" && autoRoll) {
      act = roll;
      if (canRaccoon(g))
        delay = -1; // a decision: no automatic roll
      else if (!canDouble(g)) delay = 450;
      else if (autoRollCountdown) {
        delay = COUNTDOWN_MS;
        countdown = "roll";
      }
    } else if (g.phase === "moving" && legalMoves(g).length === 0) {
      act = () => dispatch({ type: "confirm" });
      if (g.played.length === 0) delay = noPlayDelay(dice3d);
      else if (autoConfirm) {
        delay = autoConfirmDelay ? COUNTDOWN_MS : 600;
        if (autoConfirmDelay) countdown = "confirm";
      }
    }
    if (delay < 0) return;
    if (countdown) {
      const start = Date.now();
      setNow(start);
      setPending({ kind: countdown, at: start + delay, game: g });
    }
    const id = setTimeout(act, delay);
    return () => clearTimeout(id);
  }, [
    g,
    busy,
    autoRoll,
    autoRollCountdown,
    autoConfirm,
    autoConfirmDelay,
    dice3d,
    COUNTDOWN_MS,
    roll,
    dispatch,
    match?.winner,
    openingSeq,
    humanTurn,
    cancelledFor,
  ]);

  const active = pending !== null && pending.game === g && cancelledFor !== g;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active]);

  return {
    countdown: active
      ? { kind: pending.kind, seconds: Math.max(1, Math.ceil((pending.at - now) / 1000)) }
      : null,
    cancel: () => setCancelledFor(g ?? null),
  };
}

export function GameScreen({
  onMenu,
  onReplay,
  onTournament,
}: {
  onMenu: () => void;
  onReplay: (r: GameRecord) => void;
  onTournament: (id: string) => void;
}) {
  const t = useT();
  const settings = useSettings();
  const theme = useBoardTheme();
  const fireworks = useFireworks();
  const { match, players, layout, opening, busy, roll, dispatch, playChain, leave } = useGame();
  const [resigning, setResigning] = useState(false);
  const historyRef = useRef<HTMLOListElement>(null);
  const { countdown, cancel: cancelCountdown } = useAutoActions();
  useGameSounds();
  const thinking = useBotDriver();
  const online = useGame((s) => s.mode) === "online";
  const onlineInfo = useOnline((s) => s.match);
  const onlineError = useOnline((s) => s.lastError);
  const [forfeiting, setForfeiting] = useState(false);
  const moneySession = online && onlineInfo?.length === 0;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const phone = usePhoneLayout();
  /** Upright phones draw the board turned by 90° to use the screen height. */
  const boardRotated = phone?.kind === "portrait";
  const [moreOpen, setMoreOpen] = useState(false);
  const fullscreen = useFullscreen();
  const connection = useOnline((s) => s.status);
  /** The result dialog can be put aside to look at the final position. */
  const [peekBoard, setPeekBoard] = useState(false);
  const finishedGame = match?.game.phase === "finished" ? match.game : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset for every finished game
  useEffect(() => setPeekBoard(false), [finishedGame]);
  const mySeat = online && onlineInfo ? onlineInfo.seat : null;
  useYourTurnAlert(
    online &&
      mySeat !== null &&
      !!match &&
      match.game.phase !== "finished" &&
      playerToAct(match.game) === mySeat,
  );
  const resignRejected = useResignRejected(match?.game);
  // Errors from the server fade out after a few seconds.
  useEffect(() => {
    if (!onlineError) return;
    const id = setTimeout(() => useOnline.getState().set({ lastError: null }), 4000);
    return () => clearTimeout(id);
  }, [onlineError]);
  const rollFx = useGame((s) => s.rollFx);
  const [doneSeq, setDoneSeq] = useState(() => useGame.getState().rollFx?.seq ?? 0);
  // The 3D throw measures its canvas on screen, which a turned stage would distort: 2D dice there.
  const dice3d = settings.dice3d && !phone?.turned;
  const diceAnimating = dice3d && rollFx !== null && rollFx.seq !== doneSeq;
  const [hint, setHint] = useState<{ game: GameState; moves: Move[] } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // New dice first appear (2D intro or 3D throw); only then are movable checkers marked.
  const [settledSeq, setSettledSeq] = useState(() => useGame.getState().rollFx?.seq ?? 0);
  const settling = !dice3d && rollFx !== null && rollFx.seq !== settledSeq;
  useEffect(() => {
    if (!settling || !rollFx) return;
    const id = setTimeout(() => setSettledSeq(rollFx.seq), DICE_INTRO_MS);
    return () => clearTimeout(id);
  }, [settling, rollFx]);
  /** Keyboard shortcuts of the current controls (see the handler below). */
  const shortcuts = useRef<Partial<Record<Shortcut, () => void>>>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = SHORTCUT_KEYS[e.key.toLowerCase()];
      if (!key) return;
      // dialogs: only their own keys; focused buttons and the board keep Space/Enter
      const inDialog = !!el?.closest("[role=dialog]");
      // (on phones the double decision is not a dialog but part of the action dock)
      if (inDialog && !DIALOG_SHORTCUTS.has(key)) return;
      if (key === "primary" && el?.closest("button, [role=application], a")) return;
      const run = shortcuts.current[key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Safety net: never keep the 2D dice hidden if the 3D animation fails to load or finish.
  useEffect(() => {
    if (!diceAnimating || !rollFx) return;
    const id = setTimeout(() => setDoneSeq(rollFx.seq), 2500);
    return () => clearTimeout(id);
  }, [diceAnimating, rollFx]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new history entries
  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [match?.game.history.length]);

  if (!match) return null;
  const g = match.game;
  // Defensive: never draw a stale checker layout (e.g. after restoring a saved game).
  const safeLayout = layoutMatches(layout, g.board) ? layout : layoutFromBoard(g.board);
  const rules = getVariant(g.variant);
  const actor = playerToAct(g);
  const offer = g.resignOffer ?? null;
  // While an offer to resign is open, only the answer is possible.
  const humanToAct = actor !== null && players[actor].kind === "human" && !offer;
  const interactive = g.phase === "moving" && humanToAct && !busy && !diceAnimating && !settling;
  const name = (p: Player) => players[p].name;
  const noPlay = g.phase === "moving" && g.played.length === 0 && legalMoves(g).length === 0;
  const tie = g.phase === "opening" && opening !== null && opening.dice[0] === opening.dice[1];

  let status: string;
  switch (g.phase) {
    case "opening":
      status = tie ? t.tie : t.openingRoll;
      break;
    case "rolling":
      status = isClosedOut(g) ? `${name(g.turn)}: ${t.evClosedOut}` : `${name(g.turn)} ${t.toRoll}`;
      break;
    case "moving":
      status = noPlay ? `${name(g.turn)}: ${t.noPlay}` : `${name(g.turn)} ${t.toMove}`;
      break;
    case "cube-offered":
      status = `${name(g.turn)} ${t.offersDouble} ${g.cube.value * 2}`;
      break;
    case "finished":
      status = g.result ? `${name(g.result.winner)} ${t.wins}` : "";
      break;
  }
  if (thinking && actor !== null) status = `${name(actor)} ${t.thinking}`;
  if (offer && g.phase !== "finished") {
    status =
      players[offer.player].kind === "human" && players[opponent(offer.player)].kind !== "human"
        ? t.resignWaiting
        : `${name(offer.player)} ${t.resignOffered}`;
  }
  // Against the computer the board is always numbered from the human's side.
  const seat = humanSeat(players);
  const mine: Player | null = online && onlineInfo ? onlineInfo.seat : seat;
  const frameOf = (p: Player) => (online && onlineInfo ? onlineInfo.players[p].frame : null);
  const won = g.phase === "finished" && g.result !== null && mine !== null && g.result.winner === mine;
  const opponentSeat: Player | null = online && onlineInfo ? opponent(onlineInfo.seat) : null;

  const activeHint = hint?.game === g ? hint.moves : null;
  const hintText = activeHint ? describeMoves(g, activeHint) : null;
  const askHint = async () => {
    setHintLoading(true);
    try {
      setHint({
        game: g,
        moves: await askBot({ kind: "moves", state: g, level: "expert" }),
      });
    } finally {
      setHintLoading(false);
    }
  };

  const lengthLabel =
    match.config.length === 0
      ? online
        ? t.moneySession
        : t.unlimited
      : `${match.config.length} ${match.config.length === 1 ? t.point : t.points}`;

  // Keyboard: Space (or Enter) = the main button, D = double, U/Backspace = undo, H = hint,
  // Esc = stop a countdown; in the double dialog T = take, P = pass, B = beaver.
  const cubeDialog = g.phase === "cube-offered" && humanToAct && actor !== null;
  shortcuts.current = {
    primary:
      g.phase === "opening"
        ? roll
        : g.phase === "rolling" && humanToAct && !isClosedOut(g)
          ? roll
          : g.phase === "moving" && humanToAct && canConfirm(g) && !busy
            ? () => dispatch({ type: "confirm" })
            : undefined,
    double:
      g.phase === "rolling" && humanToAct && canDouble(g) ? () => dispatch({ type: "double" }) : undefined,
    undo:
      g.phase === "moving" && humanToAct && canUndo(g) && !busy
        ? () => dispatch({ type: "undo" })
        : undefined,
    hint:
      g.phase === "moving" && humanToAct && !online && !busy && !hintLoading && legalMoves(g).length > 0
        ? () => void askHint()
        : undefined,
    cancel: countdown ? cancelCountdown : undefined,
    take: cubeDialog ? () => dispatch({ type: "take" }) : undefined,
    pass: cubeDialog ? () => dispatch({ type: "drop" }) : undefined,
    beaver: cubeDialog && canBeaver(g) ? () => dispatch({ type: "beaver" }) : undefined,
  };
  /** The main button: always last and of the same width, so it stays in one place. */
  const primaryClass = "min-w-[9.5rem]";

  const controls = (
    <>
      {g.phase === "opening" && (
        <Button variant="primary" className={primaryClass} onClick={roll} aria-keyshortcuts="Space">
          {t.openingRoll}
        </Button>
      )}
      {g.phase === "rolling" && humanToAct && !isClosedOut(g) && (
        <>
          {countdown?.kind === "roll" && (
            <Button variant="ghost" onClick={cancelCountdown} aria-keyshortcuts="Escape">
              ✕ {t.cancel}
            </Button>
          )}
          {canDouble(g) && (
            <Button
              onClick={() => dispatch({ type: "double" })}
              aria-keyshortcuts="D"
              title={`${t.double} (D)`}
            >
              {t.double} ({g.cube.value * 2})
            </Button>
          )}
          {canRaccoon(g) && (
            <Button onClick={() => dispatch({ type: "raccoon" })} title={t.raccoonHint}>
              🦝 {t.raccoon} ({g.cube.value * 2})
            </Button>
          )}
          <Button
            variant="primary"
            className={primaryClass}
            onClick={roll}
            aria-keyshortcuts="Space"
            title={`${t.roll} (${t.keySpace})`}
          >
            {t.roll}
            {countdown?.kind === "roll" && <CountdownBadge seconds={countdown.seconds} />}
          </Button>
        </>
      )}
      {g.phase === "moving" && humanToAct && (
        <>
          {!online && (
            <Button
              variant="ghost"
              disabled={busy || hintLoading || legalMoves(g).length === 0}
              onClick={() => void askHint()}
              aria-keyshortcuts="H"
              title={`${t.hint} (H)`}
            >
              💡 {t.hint}
            </Button>
          )}
          <Button
            disabled={!canUndo(g) || busy}
            onClick={() => dispatch({ type: "undo" })}
            aria-keyshortcuts="U"
            title={`${t.undo} (U)`}
          >
            ↶ {t.undo}
          </Button>
          {countdown?.kind === "confirm" && (
            <Button variant="ghost" onClick={cancelCountdown} aria-keyshortcuts="Escape">
              ✕ {t.cancel}
            </Button>
          )}
          <Button
            variant="primary"
            className={primaryClass}
            disabled={!canConfirm(g) || busy}
            onClick={() => dispatch({ type: "confirm" })}
            aria-keyshortcuts="Space"
            title={`${t.confirm} (${t.keySpace})`}
          >
            {t.confirm}
            {countdown?.kind === "confirm" && <CountdownBadge seconds={countdown.seconds} />}
          </Button>
        </>
      )}
    </>
  );

  /** The actions of the phone dock / rail (the main action last). */
  const phoneActions = (): PhoneAction[] => {
    const acts: PhoneAction[] = [];
    const cancel: PhoneAction = {
      id: "cancel",
      label: t.cancel,
      icon: "✕",
      onClick: cancelCountdown,
      variant: "ghost",
      keys: "Escape",
    };
    if (g.phase === "opening") {
      acts.push({ id: "opening", label: t.openingRoll, onClick: roll, variant: "primary", keys: "Space" });
    } else if (g.phase === "rolling" && humanToAct && !isClosedOut(g)) {
      if (countdown?.kind === "roll") acts.push(cancel);
      if (canDouble(g))
        acts.push({
          id: "double",
          label: `${t.double} (${g.cube.value * 2})`,
          onClick: () => dispatch({ type: "double" }),
          variant: "secondary",
          keys: "D",
          title: `${t.double} (D)`,
        });
      if (canRaccoon(g))
        acts.push({
          id: "raccoon",
          label: `${t.raccoon} (${g.cube.value * 2})`,
          icon: "🦝",
          onClick: () => dispatch({ type: "raccoon" }),
          variant: "secondary",
          title: t.raccoonHint,
        });
      acts.push({
        id: "roll",
        label: t.roll,
        onClick: roll,
        variant: "primary",
        keys: "Space",
        title: `${t.roll} (${t.keySpace})`,
        badge: countdown?.kind === "roll" ? countdown.seconds : undefined,
      });
    } else if (g.phase === "moving" && humanToAct) {
      if (!online)
        acts.push({
          id: "hint",
          label: t.hint,
          icon: "💡",
          onClick: () => void askHint(),
          disabled: busy || hintLoading || legalMoves(g).length === 0,
          variant: "secondary",
          keys: "H",
          title: `${t.hint} (H)`,
        });
      acts.push({
        id: "undo",
        label: t.undo,
        icon: "↶",
        onClick: () => dispatch({ type: "undo" }),
        disabled: !canUndo(g) || busy,
        variant: "secondary",
        keys: "U",
        title: `${t.undo} (U)`,
      });
      if (countdown?.kind === "confirm") acts.push(cancel);
      acts.push({
        id: "confirm",
        label: t.confirm,
        onClick: () => dispatch({ type: "confirm" }),
        disabled: !canConfirm(g) || busy,
        variant: "primary",
        keys: "Space",
        title: `${t.confirm} (${t.keySpace})`,
        badge: countdown?.kind === "confirm" ? countdown.seconds : undefined,
      });
    } else if (cubeDialog) {
      // the decision stays next to the board instead of covering it
      acts.push({
        id: "drop",
        label: t.drop,
        onClick: () => dispatch({ type: "drop" }),
        variant: "danger",
        keys: "P",
        title: `${t.drop} (P)`,
      });
      if (canBeaver(g))
        acts.push({
          id: "beaver",
          label: `${t.beaver} (${g.cube.value * 4})`,
          icon: "🦫",
          onClick: () => dispatch({ type: "beaver" }),
          variant: "secondary",
          keys: "B",
          title: t.beaverHint,
        });
      acts.push({
        id: "take",
        label: t.take,
        onClick: () => dispatch({ type: "take" }),
        variant: "primary",
        keys: "T",
        title: `${t.take} (T)`,
      });
    }
    return acts;
  };

  function renderPhone() {
    if (!phone || !match) return null;
    const sideways = phone.kind === "landscape";
    // own seat at the bottom (the board is drawn from its side), the opponent on top
    const bottom: Player = seat ?? 0;
    const top = opponent(bottom);
    const info = (p: Player): PlayerInfo => ({
      name: name(p),
      frame: frameOf(p),
      pips: settings.showPips ? pipCount(rules, g.board, p) : null,
      score: match.score[p],
      active: actor === p,
      checker: <Checker player={p} />,
    });
    const statusLine = (
      <span className="inline-flex max-w-full items-center gap-2">
        {actor !== null && <Checker player={actor} />}
        <span className={sideways ? "" : "truncate"}>{status}</span>
      </span>
    );
    const gameNo = match.results.length + (g.phase === "finished" ? 0 : 1);
    const badges = (
      <>
        {online && onlineInfo && !onlineInfo.rated && (
          <span className="rounded bg-stone-700 px-1 text-stone-200">{t.unrated}</span>
        )}
        {online && onlineInfo?.tournament && (
          <span className="rounded bg-amber-500/20 px-1 text-amber-200">
            🏆{" "}
            {roundName(
              t,
              onlineInfo.tournament.round,
              onlineInfo.tournament.rounds,
              onlineInfo.tournament.format,
            )}
          </span>
        )}
        {match.crawford === "crawford-game" && (
          <span className="rounded bg-amber-500/20 px-1 text-amber-300">{t.crawford}</span>
        )}
      </>
    );
    const onlineStatus = online && onlineInfo && (
      <OnlineStatus
        deadline={
          onlineInfo.end || !onlineInfo.deadline || onlineInfo.clock
            ? null
            : onlineInfo.deadline - onlineInfo.clockOffset
        }
        clock={onlineInfo.end ? null : onlineInfo.clock}
        clockOffset={onlineInfo.clockOffset}
        seat={onlineInfo.seat}
        opponentName={onlineInfo.players[onlineInfo.seat === 0 ? 1 : 0].name}
        opponentConnected={onlineInfo.opponentConnected}
        graceUntil={onlineInfo.opponentGraceUntil}
      />
    );
    const lost = online && connection !== "ready" && (
      <p
        role="alert"
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-500/20 px-2 py-1 text-xs text-red-200"
      >
        <span className="h-2 w-2 rounded-full bg-red-400 motion-safe:animate-pulse" />
        {t.connectionLost}
      </p>
    );
    const closeThen = (fn: () => void) => () => {
      setMoreOpen(false);
      fn();
    };
    const items: SheetItem[] = [
      { id: "rules", label: t.rules, icon: "📖", onClick: closeThen(() => setRulesOpen(true)) },
      { id: "settings", label: t.settings, icon: "⚙", onClick: closeThen(() => setSettingsOpen(true)) },
    ];
    if (phone.turned || phone.kind === "portrait")
      items.push({
        id: "turn",
        label: phone.turned ? t.turnAuto : t.turnLandscape,
        icon: "⟳",
        onClick: closeThen(() => settings.update({ gameOrientation: phone.turned ? "auto" : "landscape" })),
      });
    if (fullscreenSupported())
      items.push({
        id: "fullscreen",
        label: fullscreen ? t.exitFullscreen : t.fullscreen,
        icon: "⛶",
        onClick: closeThen(() => void toggleFullscreen(sideways)),
      });
    if (g.phase !== "finished" && !offer)
      items.push({
        id: "resign",
        label: t.resign,
        icon: "🏳",
        danger: true,
        onClick: closeThen(() => setResigning(true)),
      });
    if (online && onlineInfo)
      items.push({ id: "report", label: t.report, icon: "⚑", onClick: closeThen(() => setReporting(true)) });

    const board = (
      <FitBoard ratio={sideways ? WIDTH / HEIGHT : HEIGHT / WIDTH}>
        {boardInner}
        {hintText && (
          <p className="pointer-events-none absolute inset-x-2 top-2 mx-auto w-fit rounded-full bg-stone-900/90 px-3 py-1 text-xs text-amber-200 shadow-lg">
            💡 <span className="font-mono">{hintText}</span>
          </p>
        )}
        {online && onlineError && (
          <p
            role="alert"
            className="absolute inset-x-2 bottom-2 mx-auto w-fit rounded-full bg-stone-900/90 px-3 py-1 text-xs text-red-300 shadow-lg"
          >
            ⚠ {errorText(t, onlineError)}
          </p>
        )}
      </FitBoard>
    );
    const more = (
      <IconButton label={t.more} onClick={() => setMoreOpen(true)}>
        ⋯
      </IconButton>
    );
    const back = (
      <IconButton label={t.toMenu} onClick={onMenu}>
        ←
      </IconButton>
    );
    const emote = online && onlineInfo && !onlineInfo.end && <EmoteButton />;

    return (
      <PhoneStage turned={phone.turned}>
        {sideways ? (
          <div className="flex h-full gap-2 p-2">
            <aside className="flex w-28 shrink-0 flex-col gap-2">
              <div className="flex gap-1.5">
                {back}
                {more}
              </div>
              <PlayerBar card p={info(top)} testId="player-top" />
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden text-center text-[11px] leading-tight text-stone-400">
                <span className="font-semibold text-stone-300">{rules.name}</span>
                <span>
                  {t.game} {gameNo} · {lengthLabel}
                </span>
                <span className="flex flex-wrap justify-center gap-1">{badges}</span>
                {emote}
              </div>
              <PlayerBar card p={info(bottom)} testId="player-bottom" />
            </aside>
            {board}
            <section aria-label={t.game} className="flex w-36 shrink-0 flex-col gap-2">
              {lost}
              {onlineStatus}
              <ActionArea actions={phoneActions()} status={statusLine} vertical />
            </section>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-2 p-2">
            <header className="flex shrink-0 items-center gap-2">
              {back}
              <div className="min-w-0 flex-1 text-center leading-tight">
                <div className="truncate text-sm font-semibold text-stone-100">{rules.name}</div>
                <div className="flex items-center justify-center gap-1 truncate text-xs text-stone-400">
                  <span className="truncate">
                    {t.game} {gameNo} · {lengthLabel}
                  </span>
                  {badges}
                </div>
              </div>
              {emote}
              {more}
            </header>
            {lost}
            {onlineStatus && <div className="flex shrink-0 justify-center">{onlineStatus}</div>}
            <PlayerBar p={info(top)} testId="player-top" />
            {board}
            <PlayerBar p={info(bottom)} testId="player-bottom" />
            <ActionArea actions={phoneActions()} status={statusLine} vertical={false} />
          </div>
        )}
        <MoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          side={sideways ? "right" : "bottom"}
          items={items}
        >
          <div>
            <h2 className="mb-1 text-sm font-medium text-stone-400">{t.history}</h2>
            <ol className="max-h-48 overflow-y-auto font-mono text-sm">
              {g.history.map((rec, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: history is append-only
                <li key={i} className="flex items-center gap-2 py-0.5 text-stone-300">
                  <Checker player={rec.player} />
                  {turnText(t, g.variant, rec)}
                </li>
              ))}
            </ol>
          </div>
          <XgidBox match={match} />
        </MoreSheet>
        {dialogs}
      </PhoneStage>
    );
  }

  const boardInner = (
    <>
      <Board
        state={g}
        layout={safeLayout}
        theme={theme}
        interactive={interactive}
        openingDice={opening}
        numbersFor={settings.showNumbers ? (seat ?? actor ?? 0) : null}
        onMoves={(chain) => void playChain(chain)}
        hint={activeHint}
        hideDice={diceAnimating}
        viewer={seat ?? 0}
        rotated={boardRotated}
        screenTurned={!!phone?.turned}
        mirrored={settings.homeLeft}
        diceIntro={!dice3d}
      />
      <EventBanner placement={boardRotated ? "middle" : "top"} />
      {online && <EmoteBubbles />}
      {resignRejected && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-stone-900/90 px-4 py-1.5 text-sm text-amber-200 shadow-lg">
          {t.resignRejected}
        </p>
      )}
      {diceAnimating && rollFx && (
        <Suspense fallback={null}>
          <Dice3D
            roll={
              seat === 1
                ? { ...rollFx, dice: rollFx.dice.map((d) => ({ ...d, half: d.half === 0 ? 1 : 0 })) }
                : rollFx
            }
            faceColor={theme.die.fill}
            pipColor={theme.die.pip}
            onDone={setDoneSeq}
            rotated={boardRotated}
            mirrored={settings.homeLeft}
          />
        </Suspense>
      )}
    </>
  );

  const dialogs = (
    <>
      {cubeDialog && !phone && (
        <Modal>
          <p className="mb-4 text-lg text-stone-100">
            {name(g.turn)} {t.offersDouble} <b>{g.cube.value * 2}</b>
          </p>
          {actor !== null && <p className="mb-4 text-sm text-stone-400">{name(actor)}?</p>}
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => dispatch({ type: "drop" })}
              aria-keyshortcuts="P"
              title={`${t.drop} (P)`}
            >
              {t.drop}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => dispatch({ type: "take" })}
              aria-keyshortcuts="T"
              title={`${t.take} (T)`}
            >
              {t.take}
            </Button>
          </div>
          {canBeaver(g) && (
            <Button className="mt-2 w-full" onClick={() => dispatch({ type: "beaver" })} title={t.beaverHint}>
              🦫 {t.beaver} ({g.cube.value * 4})
            </Button>
          )}
        </Modal>
      )}

      {resigning && g.phase !== "finished" && (
        <ResignDialog
          g={g}
          players={players}
          me={seat ?? actor ?? g.turn}
          online={online}
          onClose={() => setResigning(false)}
          onForfeit={() => setForfeiting(true)}
        />
      )}

      <ResignOfferPrompt g={g} players={players} />

      {reporting && onlineInfo && opponentSeat !== null && (
        <ReportDialog
          playerId={onlineInfo.players[opponentSeat].id}
          playerName={onlineInfo.players[opponentSeat].name}
          matchId={onlineInfo.matchId}
          onClose={() => setReporting(false)}
        />
      )}

      {forfeiting && (
        <Modal onClose={() => setForfeiting(false)}>
          <p className="mb-4 text-stone-100">{moneySession ? t.endSessionConfirm : t.forfeitConfirm}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setForfeiting(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                setForfeiting(false);
                leaveMatch();
                onMenu();
              }}
            >
              {moneySession ? t.endSession : t.forfeitMatch}
            </Button>
          </div>
        </Modal>
      )}

      {peekBoard && g.phase === "finished" && (
        <Button
          variant="primary"
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 shadow-2xl"
          onClick={() => setPeekBoard(false)}
        >
          🏁 {t.showResult}
        </Button>
      )}

      {online && onlineInfo?.end && !peekBoard && (
        <Modal>
          <p className="mb-1 text-2xl font-bold text-amber-200">
            {name(onlineInfo.end.winner)} {t.winsMatch}
          </p>
          {onlineInfo.end.reason !== "won" && (
            <p className="mb-2 text-stone-300">
              {onlineInfo.end.reason === "forfeit"
                ? t.reasonForfeit
                : onlineInfo.end.reason === "ended"
                  ? t.reasonEnded
                  : onlineInfo.end.reason === "time"
                    ? t.reasonTime
                    : t.reasonAbandoned}
            </p>
          )}
          <p className="mb-3 text-3xl font-bold tabular-nums text-stone-100">
            {match.score[0]} : {match.score[1]}
          </p>
          {!onlineInfo.rated && (
            <p className="mb-5 text-sm text-stone-400">
              {t.unrated}
              {onlineInfo.unratedReason ? ` – ${t.unratedReason[onlineInfo.unratedReason]}` : ""}
            </p>
          )}
          {onlineInfo.rated && (
            <p className="mb-5 text-stone-300">
              {t.ratingChange}:{" "}
              <span
                className={`font-bold ${onlineInfo.end.ratingDelta[onlineInfo.seat] >= 0 ? "text-emerald-300" : "text-red-300"}`}
              >
                {onlineInfo.end.ratingDelta[onlineInfo.seat] >= 0 ? "+" : ""}
                {onlineInfo.end.ratingDelta[onlineInfo.seat].toFixed(1)}
              </span>
            </p>
          )}
          {onlineInfo.fairCheck && (
            <p
              className={`mb-3 text-center text-sm ${
                onlineInfo.fairCheck === "failed"
                  ? "text-red-400"
                  : onlineInfo.fairCheck === "ok"
                    ? "text-emerald-400"
                    : "text-stone-500"
              }`}
              title={t.diceVerifiedHint}
            >
              {onlineInfo.fairCheck === "ok"
                ? `🎲 ✓ ${t.diceVerified}`
                : onlineInfo.fairCheck === "failed"
                  ? `⚠ ${t.diceCheckFailed}`
                  : t.diceChecking}
            </p>
          )}
          {onlineInfo.rematch === "offered" && (
            <p className="mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-center text-amber-200">
              🔁 {t.rematchOffered}
            </p>
          )}
          {onlineInfo.rematch === "declined" && (
            <p className="mb-3 text-center text-sm text-stone-400">{t.rematchDeclined}</p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                leaveMatch();
                onMenu();
              }}
            >
              {t.toMenu}
            </Button>
            {onlineInfo.tournament ? (
              // Tournaments have no rematch: back to the bracket.
              <Button
                variant="primary"
                className="flex-[2]"
                onClick={() => {
                  const id = onlineInfo.tournament!.id;
                  leaveMatch();
                  onTournament(id);
                }}
              >
                🏆 {t.tToTournament}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="flex-[2]"
                disabled={onlineInfo.rematch === "requested" || onlineInfo.rematch === "declined"}
                onClick={requestRematch}
              >
                {onlineInfo.rematch === "requested"
                  ? t.rematchWaiting
                  : onlineInfo.rematch === "offered"
                    ? `🔁 ${t.rematchAccept}`
                    : `🔁 ${t.rematch}`}
              </Button>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              className="flex-1 text-xs text-stone-400"
              onClick={() => setPeekBoard(true)}
            >
              👁 {t.viewBoard}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 text-xs text-stone-500"
              onClick={() => setReporting(true)}
            >
              ⚑ {t.report}
            </Button>
          </div>
          {opponentSeat !== null && (
            <AddFriendButton playerId={onlineInfo.players[opponentSeat].id} className="mt-1 w-full text-xs" />
          )}
        </Modal>
      )}

      {g.phase === "finished" && g.result && !(online && onlineInfo?.end) && !peekBoard && (
        <Modal>
          <p className="mb-1 text-2xl font-bold text-amber-200">
            {name(g.result.winner)} {match.winner !== null ? t.winsMatch : t.wins}
          </p>
          <p className="mb-4 text-stone-300">
            {levelName(t, g, g.result)} · +{g.result.points} {g.result.points === 1 ? t.point : t.points}
          </p>
          <p className="mb-5 text-3xl font-bold tabular-nums text-stone-100">
            {match.score[0]} : {match.score[1]}
          </p>
          {online && match.winner === null ? (
            <div className="flex flex-col items-center gap-3">
              <p className="flex items-center justify-center gap-2 text-stone-400">
                <span className="h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse" />
                {t.nextGameSoon}
              </p>
              {moneySession && (
                <Button variant="ghost" className="text-sm text-red-300" onClick={() => setForfeiting(true)}>
                  🏳 {t.endSession}
                </Button>
              )}
            </div>
          ) : online ? null : match.winner === null ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onMenu}>
                {t.toMenu}
              </Button>
              <Button variant="primary" className="flex-[2]" onClick={() => dispatch({ type: "next-game" })}>
                {t.nextGame}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                leave();
                onMenu();
              }}
            >
              {t.toMenu}
            </Button>
          )}
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" className="flex-1 text-sm" onClick={() => setPeekBoard(true)}>
              👁 {t.viewBoard}
            </Button>
            {!online && (
              <Button
                variant="ghost"
                className="flex-1 text-sm"
                onClick={() => {
                  const record = useArchive.getState().records[0];
                  if (record) onReplay(record);
                }}
              >
                ▶ {t.watchGame}
              </Button>
            )}
          </div>
        </Modal>
      )}
      {won && fireworks && <Fireworks key={match.results.length} />}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RulesDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        initial={match.config.variant === "tavli" ? g.variant : match.config.variant}
      />
    </>
  );

  if (phone) return renderPhone();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2 sm:p-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <Button
            variant="ghost"
            onClick={onMenu}
            className="shrink-0 px-3 py-1.5 text-sm"
            aria-label={t.toMenu}
          >
            ← <span className="hidden sm:inline">{t.toMenu}</span>
          </Button>
          <div className="min-w-0 truncate text-center text-xs text-stone-400 sm:text-sm">
            <span className="font-semibold text-stone-200">{rules.name}</span> · {t.game}{" "}
            {match.results.length + (g.phase === "finished" ? 0 : 1)} · {lengthLabel}
            {online && onlineInfo && !onlineInfo.rated && (
              <span
                className="ml-2 rounded bg-stone-700 px-1.5 py-0.5 text-stone-200"
                title={onlineInfo.unratedReason ? t.unratedReason[onlineInfo.unratedReason] : undefined}
              >
                {t.unrated}
              </span>
            )}
            {online && onlineInfo?.tournament && (
              <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200">
                🏆 {onlineInfo.tournament.name} ·{" "}
                {roundName(
                  t,
                  onlineInfo.tournament.round,
                  onlineInfo.tournament.rounds,
                  onlineInfo.tournament.format,
                )}
              </span>
            )}
            {match.crawford === "crawford-game" && (
              <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">{t.crawford}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {online && onlineInfo && (
              <OnlineStatus
                deadline={
                  onlineInfo.end || !onlineInfo.deadline || onlineInfo.clock
                    ? null
                    : onlineInfo.deadline - onlineInfo.clockOffset
                }
                clock={onlineInfo.end ? null : onlineInfo.clock}
                clockOffset={onlineInfo.clockOffset}
                seat={onlineInfo.seat}
                opponentName={onlineInfo.players[onlineInfo.seat === 0 ? 1 : 0].name}
                opponentConnected={onlineInfo.opponentConnected}
                graceUntil={onlineInfo.opponentGraceUntil}
              />
            )}
            {online && onlineInfo && !onlineInfo.end && <EmoteButton />}
            {g.phase !== "finished" && !offer && (
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-lg lg:hidden"
                onClick={() => setResigning(true)}
                aria-label={t.resign}
                title={t.resign}
              >
                🏳
              </Button>
            )}
            {online && onlineInfo && (
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-lg"
                onClick={() => setReporting(true)}
                aria-label={t.report}
                title={t.report}
              >
                ⚑
              </Button>
            )}
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-lg"
              onClick={() => setRulesOpen(true)}
              aria-label={t.rules}
              title={t.rules}
            >
              📖
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-lg"
              onClick={() => setSettingsOpen(true)}
              aria-label={t.settings}
              title={t.settings}
            >
              ⚙
            </Button>
          </div>
        </div>

        {online && connection !== "ready" && (
          <p
            role="alert"
            className="flex items-center justify-center gap-2 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200"
          >
            <span className="h-2 w-2 rounded-full bg-red-400 motion-safe:animate-pulse" />
            {t.connectionLost}
          </p>
        )}
        <ScoreStrip
          className="lg:hidden"
          names={[name(0), name(1)]}
          frames={[frameOf(0), frameOf(1)]}
          pips={settings.showPips ? [pipCount(rules, g.board, 0), pipCount(rules, g.board, 1)] : null}
          score={match.score}
          actor={actor}
        />
        <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40">
          {boardInner}
        </div>

        {/* status + controls */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-lg font-medium text-stone-100" aria-live="polite">
            {actor !== null && <Checker player={actor} />}
            {status}
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{controls}</div>
        </div>
        {online && onlineError && (
          <p role="alert" className="text-center text-sm text-red-400">
            ⚠ {errorText(t, onlineError)}
          </p>
        )}
        {hintText && (
          <p className="text-center text-sm text-amber-200">
            💡 {t.suggestion}: <span className="font-mono">{hintText}</span>
          </p>
        )}
        {!hintText && g.phase === "moving" && g.played.length === 0 && !noPlay && (
          <p className="text-center text-sm text-stone-500">{t.rulesHint}</p>
        )}
      </div>

      {/* side panel */}
      <aside className="flex w-full flex-col gap-3 lg:w-72">
        <div className="hidden rounded-2xl border border-stone-800 bg-stone-900/80 p-4 lg:block">
          <h2 className="mb-2 text-sm font-medium text-stone-400">{t.score}</h2>
          {([0, 1] as Player[]).map((p) => (
            <div key={p} className="flex items-center gap-2 py-1">
              <Checker player={p} />
              <span
                className={`flex-1 truncate ${actor === p ? "font-bold text-amber-200" : "text-stone-200"}`}
              >
                <PlayerName name={name(p)} frame={frameOf(p)} />
              </span>
              {settings.showPips && (
                <span className="text-xs text-stone-500">
                  {pipCount(rules, g.board, p)} {t.pips}
                </span>
              )}
              <span className="w-8 text-right text-xl font-bold tabular-nums text-stone-100">
                {match.score[p]}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
          <h2 className="mb-2 text-sm font-medium text-stone-400">{t.history}</h2>
          <ol ref={historyRef} className="max-h-48 overflow-y-auto font-mono text-sm lg:max-h-80">
            {g.history.map((rec, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: history is append-only
              <li key={i} className="flex items-center gap-2 py-0.5 text-stone-300">
                <Checker player={rec.player} />
                {turnText(t, g.variant, rec)}
              </li>
            ))}
          </ol>
        </div>

        <XgidBox match={match} />

        {g.phase !== "finished" && !offer && (
          <Button variant="ghost" className="hidden text-sm lg:block" onClick={() => setResigning(true)}>
            🏳 {t.resign}
          </Button>
        )}
        <p className="hidden px-1 text-xs leading-relaxed text-stone-500 lg:block">⌨ {t.shortcutsHint}</p>
      </aside>

      {dialogs}
    </div>
  );
}

/** Phones held upright: the board is drawn rotated to use the screen height. */
export function usePortraitPhone(): boolean {
  const query = "(orientation: portrait) and (max-width: 700px)";
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return match;
}

/**
 * When it becomes the player's turn while the app is in the background: a sound, vibration and
 * a marker in the tab title, so nobody loses on time without noticing.
 */
function useYourTurnAlert(myTurn: boolean): void {
  const t = useT();
  useEffect(() => {
    if (!myTurn) return;
    const base = document.title.replace(/^● /, "");
    const mark = () => {
      if (!document.hidden) return;
      document.title = `● ${base}`;
      sounds.yourTurn();
      navigator.vibrate?.(200);
      void notifyIfHidden(base, t.yourTurn, "your-turn");
    };
    mark();
    const onVisible = () => {
      if (!document.hidden) document.title = base;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.title = base;
    };
  }, [myTurn, t]);
}

/** Names, pips and score above the board on small screens. */
function ScoreStrip({
  names,
  frames,
  pips,
  score,
  actor,
  className = "",
}: {
  names: readonly [string, string];
  frames?: readonly [Frame | null | undefined, Frame | null | undefined];
  pips: readonly [number, number] | null;
  score: readonly [number, number];
  actor: Player | null;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`grid grid-cols-2 gap-2 text-sm ${className}`}>
      {([0, 1] as Player[]).map((p) => (
        <div
          key={p}
          className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${actor === p ? "border-amber-400/60 bg-amber-400/10" : "border-stone-800 bg-stone-900/70"}`}
        >
          <Checker player={p} />
          <span
            className={`min-w-0 flex-1 truncate ${actor === p ? "font-semibold text-amber-100" : "text-stone-200"}`}
          >
            <PlayerName name={names[p]} frame={frames?.[p]} />
          </span>
          {pips && (
            <span className="text-xs text-stone-500" title={t.pips}>
              {pips[p]}
            </span>
          )}
          <span className="text-base font-bold tabular-nums text-stone-100">{score[p]}</span>
        </div>
      ))}
    </div>
  );
}

/** Turn clock and opponent connection state in online matches. */
function OnlineStatus({
  deadline,
  clock,
  clockOffset,
  seat,
  opponentName,
  opponentConnected,
  graceUntil,
}: {
  deadline: number | null;
  clock: ClockView | null;
  clockOffset: number;
  seat: Player;
  opponentName: string;
  opponentConnected: boolean;
  graceUntil: number | null;
}) {
  const t = useT();
  // The interval only triggers re-renders; the time itself is always read fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!opponentConnected && (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300">
          ⚠ {t.opponentAway} {graceUntil ? fmt(graceUntil - now) : ""}
        </span>
      )}
      {deadline && (
        <span
          className={`rounded-full px-2 py-0.5 font-mono tabular-nums ${deadline - now < 10_000 ? "bg-red-500/25 text-red-200" : "bg-stone-800 text-stone-300"}`}
        >
          ⏱ {fmt(deadline - now)}
        </span>
      )}
      {clock &&
        ([seat, seat === 0 ? 1 : 0] as const).map((p) => {
          const left = clockLeft(clock, p, now + clockOffset);
          const running = clock.running === p;
          return (
            <span
              key={p}
              data-testid={p === seat ? "clock-me" : "clock-opponent"}
              title={running && clock.free ? t.clockFree : undefined}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono tabular-nums ${
                running
                  ? left.delay === 0 && left.reserve < 20_000
                    ? "bg-red-500/25 text-red-200"
                    : "bg-amber-400/20 text-amber-100"
                  : "bg-stone-800 text-stone-400"
              }`}
            >
              <span className="max-w-16 truncate font-sans text-xs">
                {p === seat ? t.clockYou : opponentName}
              </span>
              {running && left.delay > 0 && (
                <span className="text-xs text-emerald-300">+{Math.ceil(left.delay / 1000)}</span>
              )}
              {fmt(left.reserve)}
            </span>
          );
        })}
    </div>
  );
}

/** Delay and reserve left for a seat at server time `now` (only the running clock moves). */
export const clockLeft = (c: ClockView, p: Player, now: number): { delay: number; reserve: number } => {
  if (c.running !== p || c.since === null) return { delay: 0, reserve: c.reserve[p] };
  const used = Math.max(0, now - c.since);
  const delay = Math.max(0, c.delayMs - used);
  const beyond = Math.max(0, used - c.delayMs);
  return { delay, reserve: c.free ? c.reserve[p] : Math.max(0, c.reserve[p] - beyond) };
};

/** Seconds left until an automatic action, shown inside its button. */
/** How long the 2D dice take to roll in before checkers are marked as movable. */
const DICE_INTRO_MS = 600;

type Shortcut = "primary" | "double" | "undo" | "hint" | "cancel" | "take" | "pass" | "beaver";
const SHORTCUT_KEYS: Record<string, Shortcut> = {
  " ": "primary",
  enter: "primary",
  r: "primary",
  d: "double",
  u: "undo",
  backspace: "undo",
  h: "hint",
  escape: "cancel",
  t: "take",
  a: "take",
  p: "pass",
  b: "beaver",
};
/** Keys that work while the double dialog is open (everything else is off then). */
const DIALOG_SHORTCUTS = new Set<Shortcut>(["take", "pass", "beaver"]);

function CountdownBadge({ seconds }: { seconds: number }) {
  const t = useT();
  return (
    <span
      className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-stone-950/25 px-1.5 text-sm tabular-nums"
      title={`${t.autoIn} ${seconds} s`}
    >
      {seconds}
    </span>
  );
}

/** Notation of suggested moves including hits, e.g. "13/7* 8/7". */
const describeMoves = (g: GameState, moves: readonly Move[]): string => {
  const rules = getVariant(g.variant);
  let board = g.board;
  const played: PlayedMove[] = moves.map((m) => {
    const r = applyMoveUnchecked(rules, board, g.turn, m);
    board = r.board;
    return { ...m, hit: r.hit };
  });
  const text = formatTurn(g.variant, { kind: "move", player: g.turn, dice: g.dice ?? [0, 0], moves: played });
  return text.slice(text.indexOf(":") + 2);
};
