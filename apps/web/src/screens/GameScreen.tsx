import {
  applyMoveUnchecked,
  canConfirm,
  canDouble,
  canUndo,
  formatTurn,
  type GameResult,
  type GameState,
  getVariant,
  legalMoves,
  type Move,
  type PlayedMove,
  type Player,
  pipCount,
  playerToAct,
  type ResultLevel,
} from "@tavli/engine";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Board } from "../board/Board";
import { THEMES } from "../board/themes";
import { askBot } from "../bot/client";
import { humanSeat, useBotDriver } from "../bot/useBotDriver";
import { Button, Modal } from "../components/ui";
import { turnText, useT } from "../i18n";
import { useGameSounds } from "../sound";
import { type GameRecord, useArchive } from "../store/archive";
import { useGame } from "../store/game";
import { useSettings } from "../store/settings";

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

function Checker({ player }: { player: Player }) {
  const look = THEMES[useSettings((s) => s.style)].checkers[player];
  const fill = look.fill.startsWith("url") ? (player === 0 ? "#efe6d0" : "#3a2418") : look.fill;
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border-2"
      style={{ background: fill, borderColor: look.edge }}
      aria-hidden
    />
  );
}

/** Automatic actions: auto-roll, passing on "no play", optional auto-confirm. */
function useAutoActions() {
  const { match, busy, roll, dispatch, opening, players } = useGame();
  const { autoRoll, autoConfirm } = useSettings();
  const g = match?.game;
  // A tied opening roll leaves the game state unchanged, so the roll counter re-triggers the effect.
  const openingSeq = opening?.seq;
  // Computer players act on their own (see useBotDriver).
  const actor = g ? playerToAct(g) : null;
  const humanTurn = actor !== null && players[actor].kind === "human";
  // biome-ignore lint/correctness/useExhaustiveDependencies: openingSeq is an intentional trigger
  useEffect(() => {
    if (!g || busy || match?.winner !== null) return;
    if (g.phase !== "opening" && !humanTurn) return;
    let delay = -1;
    let act: () => void = () => {};
    if ((g.phase === "opening" || (g.phase === "rolling" && !canDouble(g))) && autoRoll) {
      delay = g.phase === "opening" ? 700 : 450;
      act = roll;
    } else if (g.phase === "moving" && legalMoves(g).length === 0) {
      if (g.played.length === 0) delay = 1400;
      else if (autoConfirm) delay = 600;
      act = () => dispatch({ type: "confirm" });
    }
    if (delay < 0) return;
    const id = setTimeout(act, delay);
    return () => clearTimeout(id);
  }, [g, busy, autoRoll, autoConfirm, roll, dispatch, match?.winner, openingSeq, humanTurn]);
}

export function GameScreen({ onMenu, onReplay }: { onMenu: () => void; onReplay: (r: GameRecord) => void }) {
  const t = useT();
  const settings = useSettings();
  const { match, players, layout, opening, busy, roll, dispatch, playChain, leave } = useGame();
  const [resigning, setResigning] = useState(false);
  const historyRef = useRef<HTMLOListElement>(null);
  useAutoActions();
  useGameSounds();
  const thinking = useBotDriver();
  const rollFx = useGame((s) => s.rollFx);
  const [doneSeq, setDoneSeq] = useState(() => useGame.getState().rollFx?.seq ?? 0);
  const diceAnimating = settings.dice3d && rollFx !== null && rollFx.seq !== doneSeq;
  const [hint, setHint] = useState<{ game: GameState; moves: Move[] } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

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
  const rules = getVariant(g.variant);
  const actor = playerToAct(g);
  const humanToAct = actor !== null && players[actor].kind === "human";
  const interactive = g.phase === "moving" && humanToAct && !busy;
  const name = (p: Player) => players[p].name;
  const noPlay = g.phase === "moving" && g.played.length === 0 && legalMoves(g).length === 0;
  const tie = g.phase === "opening" && opening !== null && opening.dice[0] === opening.dice[1];

  let status: string;
  switch (g.phase) {
    case "opening":
      status = tie ? t.tie : t.openingRoll;
      break;
    case "rolling":
      status = `${name(g.turn)} ${t.toRoll}`;
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
  // Against the computer the board is always numbered from the human's side.
  const seat = humanSeat(players);

  const activeHint = hint?.game === g ? hint.moves : null;
  const hintText = activeHint ? describeMoves(g, activeHint) : null;
  const askHint = async () => {
    setHintLoading(true);
    try {
      setHint({ game: g, moves: await askBot({ kind: "moves", state: g, level: "hard" }) });
    } finally {
      setHintLoading(false);
    }
  };

  const resignLevels: ResultLevel[] = rules.backgammons ? [1, 2, 3] : [1, 2];
  const lengthLabel = match.config.length === 0 ? t.unlimited : `${match.config.length} ${t.points}`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2 sm:p-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <Button variant="ghost" onClick={onMenu} className="px-3 py-1.5 text-sm">
            ← {t.toMenu}
          </Button>
          <div className="text-center text-sm text-stone-400">
            <span className="font-semibold text-stone-200">{rules.name}</span> · {t.game}{" "}
            {match.results.length + (g.phase === "finished" ? 0 : 1)} · {lengthLabel}
            {match.crawford === "crawford-game" && (
              <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">{t.crawford}</span>
            )}
          </div>
          <div className="w-16" />
        </div>

        <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40">
          <Board
            state={g}
            layout={layout}
            theme={THEMES[settings.style]}
            interactive={interactive}
            openingDice={opening}
            numbersFor={settings.showNumbers ? (seat ?? actor ?? 0) : null}
            onMoves={(chain) => void playChain(chain)}
            hint={activeHint}
            hideDice={diceAnimating}
          />
          {diceAnimating && rollFx && (
            <Suspense fallback={null}>
              <Dice3D
                roll={rollFx}
                faceColor={THEMES[settings.style].die.fill}
                pipColor={THEMES[settings.style].die.pip}
                onDone={setDoneSeq}
              />
            </Suspense>
          )}
        </div>

        {/* status + controls */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-lg font-medium text-stone-100" aria-live="polite">
            {actor !== null && <Checker player={actor} />}
            {status}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {g.phase === "opening" && (
              <Button variant="primary" onClick={roll}>
                {t.openingRoll}
              </Button>
            )}
            {g.phase === "rolling" && humanToAct && (
              <>
                {canDouble(g) && (
                  <Button onClick={() => dispatch({ type: "double" })}>
                    {t.double} ({g.cube.value * 2})
                  </Button>
                )}
                <Button variant="primary" onClick={roll}>
                  {t.roll}
                </Button>
              </>
            )}
            {g.phase === "moving" && humanToAct && (
              <>
                <Button
                  variant="ghost"
                  disabled={busy || hintLoading || legalMoves(g).length === 0}
                  onClick={() => void askHint()}
                >
                  💡 {t.hint}
                </Button>
                <Button disabled={!canUndo(g) || busy} onClick={() => dispatch({ type: "undo" })}>
                  ↶ {t.undo}
                </Button>
                <Button
                  variant="primary"
                  disabled={!canConfirm(g) || busy}
                  onClick={() => dispatch({ type: "confirm" })}
                >
                  {t.confirm}
                </Button>
              </>
            )}
          </div>
        </div>
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
        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
          <h2 className="mb-2 text-sm font-medium text-stone-400">{t.score}</h2>
          {([0, 1] as Player[]).map((p) => (
            <div key={p} className="flex items-center gap-2 py-1">
              <Checker player={p} />
              <span
                className={`flex-1 truncate ${actor === p ? "font-bold text-amber-200" : "text-stone-200"}`}
              >
                {name(p)}
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

        {g.phase !== "finished" && (
          <Button variant="ghost" className="text-sm" onClick={() => setResigning(true)}>
            🏳 {t.resign}
          </Button>
        )}
      </aside>

      {g.phase === "cube-offered" && humanToAct && actor !== null && (
        <Modal>
          <p className="mb-4 text-lg text-stone-100">
            {name(g.turn)} {t.offersDouble} <b>{g.cube.value * 2}</b>
          </p>
          <p className="mb-4 text-sm text-stone-400">{name(actor)}?</p>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" onClick={() => dispatch({ type: "drop" })}>
              {t.drop}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => dispatch({ type: "take" })}>
              {t.take}
            </Button>
          </div>
        </Modal>
      )}

      {resigning && g.phase !== "finished" && (
        <Modal onClose={() => setResigning(false)}>
          <p className="mb-4 text-lg text-stone-100">{t.resignConfirm}</p>
          <p className="mb-3 text-sm text-stone-400">{name(seat ?? actor ?? g.turn)}</p>
          <div className="flex flex-col gap-2">
            {resignLevels.map((level) => (
              <Button
                key={level}
                variant="danger"
                onClick={() => {
                  setResigning(false);
                  dispatch({ type: "resign", player: seat ?? actor ?? g.turn, level });
                }}
              >
                {[t.single, rules.backgammons ? t.gammon : t.mars, t.backgammon][level - 1]} (
                {level * g.cube.value})
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setResigning(false)}>
              {t.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {g.phase === "finished" && g.result && (
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
          {match.winner === null ? (
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
          <Button
            variant="ghost"
            className="mt-2 w-full text-sm"
            onClick={() => {
              const record = useArchive.getState().records[0];
              if (record) onReplay(record);
            }}
          >
            ▶ {t.watchGame}
          </Button>
        </Modal>
      )}
    </div>
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
