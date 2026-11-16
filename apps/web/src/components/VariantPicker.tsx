import type { MatchVariant } from "@tavli/engine";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { VariantRulesLink } from "../screens/RulesPanel";

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

const legend = "mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400";

/**
 * The variants as a group of name pills; the chosen one is explained below (on wide screens the
 * setup's preview card explains it instead).
 */
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
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className={legend}>{t.variant}</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(v)}
              className={`min-h-11 rounded-xl border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                on
                  ? "border-amber-400 bg-amber-400/15 font-semibold text-amber-100"
                  : "border-stone-800 bg-stone-900 text-stone-200 hover:border-stone-600"
              }`}
            >
              {NAMES[v]}
            </button>
          );
        })}
      </div>
      <div className="mt-2 lg:hidden">
        <p className="text-sm leading-snug text-stone-400">{t.variantInfo[value]}</p>
        <VariantRulesLink variant={value} />
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
  options: readonly { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className={legend}>{label}</legend>
      <div
        className="grid gap-1 rounded-xl bg-stone-900 p-1"
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
