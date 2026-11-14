import type { Frame } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HEIGHT, WIDTH } from "../board/geometry";
import { useBackToClose, useDialogFocus } from "../components/overlay";
import { PlayerName } from "../components/PlayerName";
import { useT } from "../i18n";
import { useSettings } from "../store/settings";

/**
 * Phone game layouts (see the design canvas "Tavli Mobile UI"):
 * - portrait: board turned by 90°, player bars above and below, a fixed action dock at the bottom;
 * - landscape: board at full height, players in a narrow rail on the left, actions on the right;
 * - turned: the phone is upright (rotation locked) but "always landscape" is set, so the landscape
 *   layout is drawn turned by 90° clockwise.
 * Everything else (tablets, desktops) keeps the regular page layout.
 */
export type PhoneLayout = { kind: "portrait" | "landscape"; turned: boolean } | null;

const PORTRAIT = "(orientation: portrait) and (max-width: 700px)";
const LANDSCAPE = "(orientation: landscape) and (max-height: 500px)";

const useMedia = (query: string): boolean => {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
};

export function usePhoneLayout(): PhoneLayout {
  const portrait = useMedia(PORTRAIT);
  const landscape = useMedia(LANDSCAPE);
  const always = useSettings((s) => s.gameOrientation) === "landscape";
  if (portrait) return always ? { kind: "landscape", turned: true } : { kind: "portrait", turned: false };
  if (landscape) return { kind: "landscape", turned: false };
  return null;
}

/**
 * The full-screen frame of a phone layout. Safe areas (notch, home indicator) are kept free; when
 * turned, the physical edges move round by a quarter turn. Sideways, both short ends keep at least
 * a notch's width free: not every browser reports the camera cutout, and the phone may be turned
 * either way round, so the space is the same on both sides.
 */
export function PhoneStage({
  turned,
  sideways,
  children,
}: {
  turned: boolean;
  sideways: boolean;
  children: ReactNode;
}) {
  const inset = (side: "top" | "right" | "bottom" | "left") => `env(safe-area-inset-${side}, 0px)`;
  const ends = (a: "top" | "left", b: "bottom" | "right") => `max(${inset(a)}, ${inset(b)}, 1.75rem)`;
  const style: CSSProperties = turned
    ? {
        top: 0,
        left: 0,
        width: "100dvh",
        height: "100vw",
        transformOrigin: "top left",
        transform: "translateX(100vw) rotate(90deg)",
        paddingTop: inset("right"),
        paddingRight: ends("top", "bottom"),
        paddingBottom: inset("left"),
        paddingLeft: ends("top", "bottom"),
      }
    : {
        inset: 0,
        paddingTop: inset("top"),
        paddingRight: sideways ? ends("left", "right") : inset("right"),
        paddingBottom: inset("bottom"),
        paddingLeft: sideways ? ends("left", "right") : inset("left"),
      };
  return (
    <div
      data-testid="phone-stage"
      data-turned={turned || undefined}
      className="fixed z-30 overflow-hidden overscroll-none bg-stone-950"
      style={style}
    >
      {children}
    </div>
  );
}

/** Largest box of the given width/height ratio that fits into the measured element. */
export function useFit(ratio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // clientWidth/Height are layout sizes, unaffected by the turned stage
      const w = Math.floor(Math.min(el.clientWidth, el.clientHeight * ratio));
      setSize((s) => (s && s.w === w ? s : { w, h: Math.floor(w / ratio) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return [ref, size] as const;
}

/** The board area: takes the free space and draws the board as large as it fits. */
export function FitBoard({ ratio, children }: { ratio: number; children: ReactNode }) {
  const [ref, size] = useFit(ratio);
  return (
    <div ref={ref} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      {size && (
        <div
          data-testid="phone-board"
          className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/40"
          style={{ width: size.w, height: size.h }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface PlayerInfo {
  readonly name: string;
  readonly frame?: Frame | null;
  readonly pips: number | null;
  readonly score: number;
  readonly active: boolean;
  readonly checker: ReactNode;
}

/** A player's line (portrait) or card (landscape rail). */
export function PlayerBar({ p, card = false, testId }: { p: PlayerInfo; card?: boolean; testId?: string }) {
  const t = useT();
  const tone = p.active ? "border-amber-400/60 bg-amber-400/10" : "border-stone-800 bg-stone-900/80";
  if (card)
    return (
      <div
        data-testid={testId}
        className={`flex w-full flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-center ${tone}`}
      >
        <div className="flex items-center gap-1">
          {p.checker}
          <span className="text-xl font-bold leading-none tabular-nums text-stone-50">{p.score}</span>
        </div>
        <span
          className={`w-full truncate text-[10px] leading-tight ${p.active ? "font-semibold text-amber-100" : "text-stone-300"}`}
        >
          <PlayerName name={p.name} frame={p.frame} />
        </span>
        {p.pips !== null && (
          <span className="text-[10px] leading-none tabular-nums text-stone-400" title={t.pips}>
            {p.pips} {t.pips}
          </span>
        )}
      </div>
    );
  return (
    <div
      data-testid={testId}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm ${tone}`}
    >
      {p.checker}
      <span
        className={`min-w-0 flex-1 truncate ${p.active ? "font-semibold text-amber-100" : "text-stone-200"}`}
      >
        <PlayerName name={p.name} frame={p.frame} />
      </span>
      {p.pips !== null && (
        <span className="text-xs text-stone-400" title={t.pips}>
          {p.pips} {t.pips}
        </span>
      )}
      <span className="min-w-6 text-right text-lg font-bold tabular-nums text-stone-50">{p.score}</span>
    </div>
  );
}

/** One button of the action dock or rail. */
export interface PhoneAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant: "primary" | "secondary" | "danger" | "ghost";
  readonly keys?: string;
  readonly title?: string;
  /** Countdown seconds shown in the button. */
  readonly badge?: number;
}

const ACTION_STYLE: Record<PhoneAction["variant"], string> = {
  primary: "bg-amber-500 text-stone-950 active:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-400",
  secondary: "bg-stone-800 text-stone-100 active:bg-stone-700 disabled:opacity-40",
  danger: "bg-red-800 text-red-50 active:bg-red-700 disabled:opacity-40",
  ghost: "border border-stone-700 bg-transparent text-stone-300 active:bg-stone-800 disabled:opacity-40",
};

function ActionButton({ a, className = "" }: { a: PhoneAction; className?: string }) {
  const primary = a.variant === "primary";
  return (
    <button
      type="button"
      onClick={a.onClick}
      disabled={a.disabled}
      aria-keyshortcuts={a.keys}
      title={a.title}
      className={`flex min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed ${primary ? "text-base" : "flex-col gap-0.5 text-xs"} ${ACTION_STYLE[a.variant]} ${className}`}
    >
      {a.icon && (
        <span aria-hidden className={primary ? "" : "text-lg leading-none"}>
          {a.icon}
        </span>
      )}
      <span className="truncate">{a.label}</span>
      {a.badge !== undefined && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-stone-950/25 px-1.5 text-sm tabular-nums">
          {a.badge}
        </span>
      )}
    </button>
  );
}

/**
 * The actions of the moment: the main action always last, so it stays in one place (bottom right
 * upright, bottom of the right rail sideways). Without actions the status is shown instead.
 */
export function ActionArea({
  actions,
  status,
  vertical,
}: {
  actions: readonly PhoneAction[];
  status: ReactNode;
  vertical: boolean;
}) {
  const main = actions.find((a) => a.variant === "primary");
  const others = actions.filter((a) => a !== main);
  if (vertical)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          className="min-h-0 flex-1 overflow-hidden text-sm leading-snug text-stone-200"
          aria-live="polite"
        >
          {status}
        </div>
        {others.length > 0 && (
          <div className={`grid gap-2 ${others.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {others.map((a) => (
              <ActionButton key={a.id} a={a} className="h-12" />
            ))}
          </div>
        )}
        {main && <ActionButton a={main} className="h-16 w-full" />}
      </div>
    );
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="truncate px-1 text-center text-sm text-stone-300" aria-live="polite">
        {status}
      </div>
      {actions.length > 0 && (
        <div className="flex h-14 gap-2">
          {others.map((a) => (
            <ActionButton key={a.id} a={a} className="flex-1" />
          ))}
          {main && <ActionButton a={main} className={others.length ? "flex-[1.6]" : "flex-1"} />}
        </div>
      )}
    </div>
  );
}

/** A small icon button of the top bar or rail. */
export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-lg text-stone-200 active:bg-stone-800 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      {children}
    </button>
  );
}

export interface SheetItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly onClick: () => void;
  readonly danger?: boolean;
}

/** The "More" sheet: from the bottom upright, from the right sideways. */
export function MoreSheet({
  open,
  onClose,
  side,
  items,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "bottom" | "right";
  items: readonly SheetItem[];
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, open, onClose);
  useBackToClose(open, onClose);
  const bottom = side === "bottom";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-40 flex bg-black/55 ${bottom ? "items-end" : "justify-end"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={t.more}
            tabIndex={-1}
            className={`flex flex-col gap-3 overflow-y-auto border-stone-800 bg-stone-900 p-4 shadow-2xl outline-none ${
              bottom ? "max-h-[85%] w-full rounded-t-2xl border-t" : "h-full w-80 max-w-[85%] border-l"
            }`}
            initial={bottom ? { y: "100%" } : { x: "100%" }}
            animate={bottom ? { y: 0 } : { x: 0 }}
            exit={bottom ? { y: "100%" } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            {bottom && <span aria-hidden className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-stone-600" />}
            <div className="grid grid-cols-4 gap-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={it.onClick}
                  className={`flex h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    it.danger ? "bg-red-900/50 text-red-100" : "bg-stone-800 text-stone-200"
                  }`}
                >
                  <span aria-hidden className="text-xl leading-none">
                    {it.icon}
                  </span>
                  {it.label}
                </button>
              ))}
            </div>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Full screen (where the browser allows it); sideways games also lock the orientation (Android). */
export const fullscreenSupported = (): boolean =>
  typeof document !== "undefined" && !!document.fullscreenEnabled;

export const toggleFullscreen = async (landscape: boolean): Promise<void> => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (landscape) await orientation.lock?.("landscape").catch(() => {});
  } catch {
    // not allowed here (e.g. iPhone Safari): nothing to do
  }
};

export const useFullscreen = (): boolean => {
  const [on, setOn] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return on;
};

/**
 * The other board screens (watching, replays, correspondence, lessons, puzzles) on phones held
 * sideways: the board is never taller than the screen, so it can be seen whole.
 */
export function useSidewaysBoardStyle(): CSSProperties | undefined {
  const sideways = useMedia(LANDSCAPE);
  return sideways
    ? { width: `min(100%, calc((100dvh - 1rem) * ${WIDTH / HEIGHT}))`, marginInline: "auto" }
    : undefined;
}
