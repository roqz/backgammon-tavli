import {
  canOfferResign,
  type GameState,
  getVariant,
  type MatchState,
  maxResultLevel,
  opponent,
  type Player,
  type ResultLevel,
  toXgid,
  XGID_VARIANTS,
} from "@tavli/engine";
import { EMOTES, type EmoteId, REPORT_REASONS, type ReportReason } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "../components/ui";
import { useT } from "../i18n";
import { reportPlayer, sendEmote } from "../online/client";
import { useOnline } from "../online/store";
import { type PlayerInfo, useGame } from "../store/game";
import { useSettings } from "../store/settings";

type T = ReturnType<typeof useT>;

export const resultName = (t: T, g: GameState, level: ResultLevel): string =>
  [t.single, getVariant(g.variant).backgammons ? t.gammon : t.mars, t.backgammon][level - 1]!;

/**
 * Resigning. Two people at one device simply choose the result. Against the computer or online
 * smaller results are *offered* (the opponent accepts or rejects); resigning without an offer
 * concedes the highest result that is still possible.
 */
export function ResignDialog({
  g,
  players,
  me,
  online,
  onClose,
  onForfeit,
}: {
  g: GameState;
  players: readonly [PlayerInfo, PlayerInfo];
  me: Player;
  online: boolean;
  onClose: () => void;
  onForfeit: () => void;
}) {
  const t = useT();
  const dispatch = useGame((s) => s.dispatch);
  const hotseat = !online && players[0].kind === "human" && players[1].kind === "human";
  const max = maxResultLevel(g, opponent(me));
  const levels = ([1, 2, 3] as ResultLevel[]).filter((l) => l <= max);
  const label = (l: ResultLevel) => `${resultName(t, g, l)} (${l * g.cube.value})`;
  const act = (type: "resign" | "offer-resign", level: ResultLevel) => {
    onClose();
    dispatch({ type, player: me, level });
  };

  return (
    <Modal onClose={onClose}>
      <p className="mb-1 text-lg text-stone-100">{hotseat ? t.resignConfirm : t.resign}</p>
      <p className="mb-4 text-sm text-stone-400">{players[me].name}</p>
      <div className="flex flex-col gap-2">
        {hotseat ? (
          levels.map((l) => (
            <Button key={l} variant="danger" onClick={() => act("resign", l)}>
              {label(l)}
            </Button>
          ))
        ) : (
          <>
            {max > 1 &&
              (canOfferResign(g, me) ? (
                <>
                  <p className="text-xs text-stone-400">{t.offerResignHint}</p>
                  {levels
                    .filter((l) => l < max)
                    .map((l) => (
                      <Button key={l} onClick={() => act("offer-resign", l)}>
                        🤝 {t.offerResign}: {label(l)}
                      </Button>
                    ))}
                </>
              ) : (
                <p className="text-xs text-stone-400">{t.resignOnlyOnTurn}</p>
              ))}
            <p className="mt-2 text-xs text-stone-400">{t.resignNowHint}</p>
            <Button variant="danger" onClick={() => act("resign", max)}>
              🏳 {t.resignNow}: {label(max)}
            </Button>
          </>
        )}
        {online && (
          <Button
            variant="ghost"
            className="text-red-300"
            onClick={() => {
              onClose();
              onForfeit();
            }}
          >
            🏳 {t.forfeitMatch}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    </Modal>
  );
}

/** A pending resignation offer: the human who has to answer gets a dialog. */
export function ResignOfferPrompt({
  g,
  players,
}: {
  g: GameState;
  players: readonly [PlayerInfo, PlayerInfo];
}) {
  const t = useT();
  const dispatch = useGame((s) => s.dispatch);
  const offer = g.resignOffer;
  if (!offer || g.phase === "finished") return null;
  const responder = opponent(offer.player);
  if (players[responder].kind !== "human") return null;
  return (
    <Modal>
      <p className="mb-1 text-lg text-stone-100">
        {players[offer.player].name} {t.resignOffered}:
      </p>
      <p className="mb-5 text-2xl font-bold text-amber-200">
        {resultName(t, g, offer.level)} · {offer.level * g.cube.value}{" "}
        {offer.level * g.cube.value === 1 ? t.point : t.points}
      </p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => dispatch({ type: "reject-resign" })}>
          {t.resignReject}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => dispatch({ type: "accept-resign" })}>
          {t.resignAccept}
        </Button>
      </div>
    </Modal>
  );
}

/** Short note when an offer to resign was rejected and the game goes on. */
export function useResignRejected(g: GameState | undefined): boolean {
  const previous = useRef(g?.resignOffer ?? null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = g?.resignOffer ?? null;
    if (!before || g?.resignOffer || !g || g.phase === "finished") return;
    setShown(true);
    const id = setTimeout(() => setShown(false), 3000);
    return () => clearTimeout(id);
  }, [g]);
  return shown;
}

/** Quick messages in online matches: picker button plus speech bubbles over the board. */
export function EmoteButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Closes on Escape and on a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        className="px-3 py-1.5 text-lg"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.emotes}
        aria-expanded={open}
        title={t.emotes}
      >
        💬
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 grid w-56 grid-cols-1 gap-1 rounded-xl border border-stone-700 bg-stone-900 p-2 shadow-2xl">
          {EMOTES.map((id) => (
            <button
              key={id}
              type="button"
              className="rounded-lg px-3 py-1.5 text-left text-sm text-stone-200 hover:bg-stone-800"
              onClick={() => {
                sendEmote(id);
                setOpen(false);
              }}
            >
              {t.emote[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BUBBLE_MS = 3500;

export function EmoteBubbles() {
  const t = useT();
  const info = useOnline((s) => s.match);
  const showEmotes = useSettings((s) => s.showEmotes);
  const [visible, setVisible] = useState<{ seat: Player; id: EmoteId; seq: number } | null>(null);
  const emote = info?.emote ?? null;
  useEffect(() => {
    if (!emote) return;
    setVisible(emote);
    const id = setTimeout(() => setVisible(null), BUBBLE_MS);
    return () => clearTimeout(id);
  }, [emote]);
  if (!info) return null;
  const mine = visible?.seat === info.seat;
  const show = visible && (mine || showEmotes);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={visible.seq}
          initial={{ opacity: 0, y: mine ? 8 : -8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className={`pointer-events-none absolute z-30 max-w-[60%] rounded-2xl px-4 py-2 text-sm font-medium shadow-xl ${
            mine
              ? "right-3 bottom-3 rounded-br-sm bg-amber-400 text-stone-950"
              : "left-3 top-3 rounded-tl-sm bg-stone-100 text-stone-900"
          }`}
          role="status"
        >
          {!mine && <span className="mr-1 font-semibold">{info.players[visible.seat].name}:</span>}
          {t.emote[visible.id]}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Report an opponent of an online match to the moderators. */
export function ReportDialog({
  playerId,
  playerName,
  matchId,
  onClose,
}: {
  playerId: string;
  playerName: string;
  matchId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState<ReportReason>("cheating");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"edit" | "sending" | "sent" | "duplicate">("edit");
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setState("sending");
    setError(null);
    try {
      setState((await reportPlayer(playerId, matchId, reason, note)) ? "sent" : "duplicate");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("edit");
    }
  };
  return (
    <Modal onClose={onClose}>
      <p className="mb-1 text-lg text-stone-100">⚑ {t.reportTitle}</p>
      <p className="mb-4 text-sm text-stone-400">{playerName}</p>
      {state === "sent" || state === "duplicate" ? (
        <>
          <p className="mb-4 text-stone-200">{state === "sent" ? t.reportThanks : t.reportDuplicate}</p>
          <Button variant="primary" className="w-full" onClick={onClose}>
            OK
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-stone-200">
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-amber-500"
                />
                {t.reportReason[r]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.reportNote}
            <textarea
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={state === "sending"}
              onClick={() => void send()}
            >
              {t.reportSend}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** XGID of the current position with a copy button (Backgammon and Portes). */
export function XgidBox({ match }: { match: MatchState }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const g = match.game;
  if (!XGID_VARIANTS.includes(g.variant) || g.phase === "opening" || g.phase === "finished") return null;
  const id = toXgid(g, {
    score: match.score,
    length: match.config.length,
    crawford: match.crawford === "crawford-game",
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available (e.g. insecure context): the text can still be selected
    }
  };
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-400">{t.xgid}</h2>
        <button
          type="button"
          className="text-xs text-amber-300 hover:text-amber-200"
          onClick={() => void copy()}
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <p
        className="select-all break-all font-mono text-[11px] leading-snug text-stone-400"
        data-testid="xgid"
      >
        {id}
      </p>
    </div>
  );
}
