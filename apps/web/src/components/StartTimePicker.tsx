import { SCHEDULE_MAX_AHEAD_MS, SCHEDULE_MIN_AHEAD_MS } from "@tavli/protocol";
import { useT } from "../i18n";
import { Toggle } from "./ui";

/** Tomorrow at 19:00 local time: a sensible first suggestion for a club evening. */
const suggestion = (): number => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d.getTime();
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Value for <input type="datetime-local"> in local time. */
const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Whether a start time is within what the server accepts. */
export const validStart = (ms: number | null): boolean => {
  if (ms === null) return true;
  const ahead = ms - Date.now();
  return ahead >= SCHEDULE_MIN_AHEAD_MS && ahead <= SCHEDULE_MAX_AHEAD_MS;
};

/** Date and time of a scheduled start, e.g. "Fr., 20. Nov., 19:00". */
export const formatStart = (ms: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);

/** Optional fixed start time (tournaments, leagues). */
export function StartTimePicker({
  value,
  onChange,
  hint,
}: {
  value: number | null;
  onChange: (ms: number | null) => void;
  hint: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <Toggle
        checked={value !== null}
        onChange={(on) => onChange(on ? suggestion() : null)}
        label={t.startFixed}
        description={hint}
      />
      {value !== null && (
        <>
          <input
            type="datetime-local"
            aria-label={t.startFixed}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
            value={toLocalInput(value)}
            onChange={(e) => {
              const ms = new Date(e.target.value).getTime();
              if (!Number.isNaN(ms)) onChange(ms);
            }}
          />
          {!validStart(value) && <p className="text-xs text-red-400">{t.startOutOfRange}</p>}
        </>
      )}
    </div>
  );
}
