import { type ButtonHTMLAttributes, type ReactNode, useRef } from "react";
import { useBackToClose, useDialogFocus } from "./overlay";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-400",
  secondary: "bg-stone-700 text-stone-100 hover:bg-stone-600 disabled:opacity-40",
  ghost: "bg-transparent text-stone-300 hover:bg-stone-800 disabled:opacity-40",
  danger: "bg-red-800 text-red-50 hover:bg-red-700 disabled:opacity-40",
};

export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-stone-400">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            disabled={o.disabled}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              o.value === value
                ? "border-amber-400 bg-amber-400/15 text-amber-200"
                : "border-stone-700 bg-stone-800/60 text-stone-200 hover:border-stone-500"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Tab bar (ARIA tablist; arrow keys move between tabs). */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    requestAnimationFrame(() => document.getElementById(`tab-${String(next.value)}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          id={`tab-${o.value}`}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move(1);
            else if (e.key === "ArrowLeft") move(-1);
          }}
          className={`rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
            o.value === value
              ? "border-amber-400 bg-amber-400/15 text-amber-200"
              : "border-stone-700 bg-stone-800/60 text-stone-200 hover:border-stone-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Accessible on/off switch with label and optional description. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  sub = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Indented sub-option of the toggle above. */
  sub?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${sub ? "ml-3 border-l-2 border-stone-800 pl-4" : ""} ${disabled ? "opacity-40" : ""}`}
    >
      <div className="min-w-0">
        <div className={`text-stone-100 ${sub ? "text-sm" : ""}`}>{label}</div>
        {description && <div className="mt-0.5 text-xs leading-snug text-stone-500">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed ${checked ? "bg-amber-500" : "bg-stone-700"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

/** Titled group of settings. */
export function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/70 px-5 py-4">
      <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      <div className="divide-y divide-stone-800/80">{children}</div>
    </section>
  );
}

export function Card({
  children,
  className = "",
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border border-stone-800 bg-stone-900/80 p-5 shadow-xl ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Modal dialog: focus moves inside and stays there, Escape and the device Back button close it
 * (when it can be closed), focus returns to the opener afterwards.
 */
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, onClose);
  useBackToClose(true, onClose);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes the dialog; keys are handled in useDialogFocus
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
