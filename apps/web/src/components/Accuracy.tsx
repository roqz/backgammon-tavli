/**
 * The player's own accuracy: how often their checker play matched the expert computer in online
 * matches (from the server's fair-play analysis). Only the player sees it.
 */
import type { AccuracyReport, MatchAccuracy } from "@tavli/protocol";
import { type Dict, useT } from "../i18n";
import { Icon } from "./Icon";
import { Card } from "./ui";

/**
 * Levels by the average equity lost per decision against the expert (neural network). The loss
 * depends less on the variant than the agreement does (Fevga has many near-equal moves). In
 * self-play the expert loses 0.004–0.010, the strong bot 0.033 (Backgammon, Portes) to
 * 0.063–0.077 (Fevga, Plakoto), the easy bot 0.10–0.13 points per decision.
 */
const LEVELS = [
  [0.02, "accuracyLevel5"],
  [0.035, "accuracyLevel4"],
  [0.055, "accuracyLevel3"],
  [0.085, "accuracyLevel2"],
  [Number.POSITIVE_INFINITY, "accuracyLevel1"],
] as const;

export const accuracyLevel = (t: Dict, averageLoss: number): string =>
  t[LEVELS.find(([max]) => averageLoss <= max)![1]];

export const percent = (x: number) => `${Math.round(x * 100)} %`;

/** "−0,042": average points lost per decision. */
const loss = (t: Dict, x: number) =>
  x.toLocaleString(t.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function AccuracyCard({ report }: { report: AccuracyReport | null }) {
  const t = useT();
  const s = report?.summary ?? null;
  const trend = s && report?.before ? Math.round((s.agreement - report.before.agreement) * 100) : null;
  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-stone-200">
        <Icon name="target" /> {t.accuracyTitle}
      </h2>
      {!report ? (
        <p className="text-sm text-stone-500">{t.loading}</p>
      ) : !s ? (
        <p className="text-sm text-stone-400">{t.accuracyNone}</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="accuracy">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="font-display text-4xl font-semibold text-amber-100 tabular-nums">
                {percent(s.agreement)}
              </div>
              <div className="text-xs text-stone-400">{t.accuracyAgreement}</div>
            </div>
            <div className="pb-1">
              <div className="text-sm font-semibold text-stone-200">{accuracyLevel(t, s.averageLoss)}</div>
              <div className="text-xs text-stone-400">
                {t.accuracyLoss.replace("{n}", loss(t, s.averageLoss))} ·{" "}
                {t.accuracyDecisions.replace("{n}", String(s.decisions))}
              </div>
              {trend !== null && trend !== 0 && (
                <div className={`text-xs ${trend > 0 ? "text-emerald-300" : "text-stone-400"}`}>
                  {(trend > 0 ? t.accuracyUp : t.accuracyDown).replace("{n}", String(Math.abs(trend)))}
                </div>
              )}
            </div>
          </div>
          {report.matches.length > 1 && <AccuracyBars matches={report.matches} />}
          <p className="text-xs leading-relaxed text-stone-500">{t.accuracyHint}</p>
        </div>
      )}
    </Card>
  );
}

/** Agreement per match, oldest left; one thin bar each, with the value on hover. */
function AccuracyBars({ matches }: { matches: readonly MatchAccuracy[] }) {
  const t = useT();
  const list = [...matches].slice(0, 20).reverse();
  const H = 48;
  const W = 8;
  const GAP = 4;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${list.length * (W + GAP)} ${H + 1}`}
        className="h-12 w-full max-w-sm"
        preserveAspectRatio="xMinYMax meet"
        role="img"
        aria-label={t.accuracyPerMatch}
      >
        {[0.5].map((y) => (
          <line
            key={y}
            x1={0}
            x2={list.length * (W + GAP)}
            y1={H - y * H}
            y2={H - y * H}
            className="stroke-stone-700"
            strokeDasharray="2 3"
            strokeWidth={1}
          />
        ))}
        {list.map((m, i) => {
          const h = Math.max(2, m.agreement * H);
          return (
            <g key={m.matchId}>
              <title>{`${new Date(m.at).toLocaleDateString(t.locale)}: ${percent(m.agreement)}`}</title>
              {/* a wider invisible hit area */}
              <rect x={i * (W + GAP) - GAP / 2} y={0} width={W + GAP} height={H} fill="transparent" />
              <path
                d={`M${i * (W + GAP)},${H} v${-(h - 3)} q0,-3 3,-3 h${W - 6} q3,0 3,3 v${h - 3} z`}
                className="fill-amber-400/80"
              />
            </g>
          );
        })}
        <line
          x1={0}
          x2={list.length * (W + GAP)}
          y1={H}
          y2={H}
          className="stroke-stone-600"
          strokeWidth={1}
        />
      </svg>
      <figcaption className="text-xs text-stone-500">{t.accuracyPerMatch}</figcaption>
    </figure>
  );
}
