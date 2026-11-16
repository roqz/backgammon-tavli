import { createGame, type MatchVariant } from "@tavli/engine";
import { type ReactNode, useMemo } from "react";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";
import { THEMES } from "../board/themes";
import { useT } from "../i18n";
import { useBoardTheme } from "../rewards";
import { VariantRulesLink } from "../screens/RulesPanel";
import { useSettings } from "../store/settings";
import { variantShortName } from "./VariantPicker";

const noop = () => {};

/** The starting position of a variant in the player's board style (decoration, not interactive). */
/** The opening position of a variant; `classic` ignores the chosen look (start page title picture). */
export function BoardPreview({
  variant,
  className = "",
  classic = false,
}: {
  variant: MatchVariant;
  className?: string;
  classic?: boolean;
}) {
  const chosen = useBoardTheme();
  const theme = classic ? THEMES.classic : chosen;
  const homeLeft = useSettings((s) => s.homeLeft);
  // a Tavli match opens with Portes
  const state = useMemo(() => createGame({ variant: variant === "tavli" ? "portes" : variant }), [variant]);
  const layout = useMemo(() => layoutFromBoard(state.board), [state]);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden rounded-xl shadow-xl ring-1 ring-black/40 ${className}`}
    >
      <Board
        state={state}
        layout={layout}
        theme={theme}
        interactive={false}
        openingDice={null}
        numbersFor={null}
        onMoves={noop}
        mirrored={homeLeft}
        diceIntro={false}
      />
    </div>
  );
}

interface StartAction {
  readonly label: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

function StartButton({ action, summary }: { action: StartAction; summary: string }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onClick}
      className="flex min-h-14 w-full flex-col items-center justify-center rounded-xl bg-felt-500 px-4 py-2 short:min-h-12 short:py-1 text-lg font-bold text-stone-50 hover:bg-felt-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:bg-stone-700 disabled:text-stone-400"
    >
      {action.label}
      <span className="text-xs font-medium opacity-80">{summary}</span>
    </button>
  );
}

/**
 * A game setup: the options on the left; on wide screens a card on the right shows the variant's
 * board, what it is about and the start button. On phones the start button stays at the bottom.
 */
export function SetupLayout({
  variant,
  summary,
  action,
  secondary,
  children,
}: {
  variant: MatchVariant;
  summary: string;
  action: StartAction;
  /** A second action under the start button (e.g. inviting a friend). */
  secondary?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <aside className="sticky top-24 hidden flex-col gap-4 rounded-xl border border-stone-800 bg-stone-900/80 p-5 lg:flex">
        <BoardPreview variant={variant} />
        <div>
          <h2 className="font-display text-2xl font-semibold text-stone-50">{variantShortName(variant)}</h2>
          <p className="mt-1 text-sm leading-snug text-stone-400">{t.variantInfo[variant]}</p>
          <VariantRulesLink variant={variant} className="mt-1" />
        </div>
        <StartButton action={action} summary={summary} />
        {secondary}
      </aside>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t border-stone-800 bg-stone-950 px-4 py-3 short:bottom-0 short:flex-row short:py-2 short:[&>*]:flex-1 short:pb-[max(0.75rem,env(safe-area-inset-bottom))] wide:bottom-0 wide:mx-0 wide:border-x wide:rounded-t-xl lg:hidden">
        {secondary}
        <StartButton action={action} summary={summary} />
      </div>
    </div>
  );
}
