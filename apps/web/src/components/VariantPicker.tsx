import type { MatchVariant } from "@tavli/engine";
import { useEffect, useRef } from "react";
import { useT } from "../i18n";

const NAMES: Record<MatchVariant, string> = {
  backgammon: "Backgammon",
  portes: "Portes",
  plakoto: "Plakoto",
  fevga: "Fevga",
  tavli: "Tavli",
  tavla: "Tavla",
  narde: "Narde",
  hypergammon: "Hypergammon",
};

export const variantShortName = (v: MatchVariant): string => NAMES[v];

/** The variants as a row of cards with a one-line description, swiped sideways on phones. */
export function VariantPicker<V extends MatchVariant>({
  value,
  onChange,
  variants,
}: {
  value: V;
  onChange: (v: V) => void;
  variants: readonly V[];
}) {
  const t = useT();
  const row = useRef<HTMLDivElement>(null);
  // the chosen card is visible when the form opens
  useEffect(() => {
    row.current
      ?.querySelector<HTMLElement>("[aria-pressed=true]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
        {t.variant}
      </legend>
      <div
        ref={row}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0"
      >
        {variants.map((v) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(v)}
              aria-label={NAMES[v]}
              aria-describedby={`variant-info-${v}`}
              className={`flex w-40 shrink-0 snap-start flex-col gap-1 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 sm:w-auto ${
                on
                  ? "border-amber-400 bg-amber-400/10"
                  : "border-stone-800 bg-stone-900 hover:border-stone-600"
              }`}
            >
              <span className="text-[15px] font-semibold text-stone-50">{NAMES[v]}</span>
              <span
                id={`variant-info-${v}`}
                className={`line-clamp-3 text-xs leading-snug ${on ? "text-stone-300" : "text-stone-400"}`}
              >
                {t.variantInfo[v]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Pill row for few short options (length, level, time). */
export function Choice<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; title?: string }[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</legend>
      <div
        className="grid gap-1 rounded-2xl bg-stone-900 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(o.value)}
            className={`min-h-11 truncate rounded-xl px-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              o.value === value
                ? "bg-stone-700 font-semibold text-amber-100"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
