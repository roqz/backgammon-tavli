import type { Frame } from "@tavli/protocol";
import { type Dict, useT } from "../i18n";
import { Icon } from "./Icon";
import { Medallion, RankMark } from "./Medallion";

/** Text of a title id: an achievement title or "month-winner:YYYY-MM:<rating key>". */
export const titleText = (t: Dict, id: string): string => {
  if (id.startsWith("month-winner:")) {
    const [, month = "", key = ""] = id.split(":");
    const when = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(t.locale, {
      month: "short",
      year: "numeric",
    });
    const [variant, pool] = key.split("@");
    const name =
      variant === "tavli" ? "Tavli" : variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : "";
    return `${t.titleMonth.replace("{month}", when)} · ${name}${pool === "blitz" ? ` · ${t.timeControls.blitz}` : ""}`;
  }
  return t.titles[id] ?? id;
};

/**
 * A player's name with the medallion of the chosen frame (an unlocked reward), the club rank mark,
 * the supporter heart and, in the player bars, the chosen title in brass below.
 */
export function PlayerName({
  name,
  frame,
  rank = 0,
  supporter = false,
  title = null,
  size = 20,
  shine = false,
  className = "",
}: {
  name: string;
  frame?: Frame | null;
  /** Club rank: from 1 (regular) on a small brass mark after the name. */
  rank?: number;
  /** Supports the project: a small brass heart. */
  supporter?: boolean;
  /** Title id shown below the name (player bars, profile). */
  title?: string | null;
  /** Medallion size in px: 20 in lists, 26 in the player bars. */
  size?: number;
  /** One gleam across a rare medallion (match start). */
  shine?: boolean;
  className?: string;
}) {
  const t = useT();
  const line = (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{name}</span>
      {supporter && (
        <Icon name="heart" className="h-3 w-3 shrink-0 fill-current text-brass" label={t.supporterBadge} />
      )}
      {rank > 0 && <RankMark rank={rank} label={`${t.clubRankTitle}: ${t.clubRanks[rank]}`} />}
    </span>
  );
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {frame && <Medallion frame={frame} size={size} label={t.frameNames[frame]} shine={shine} />}
      {title ? (
        <span className="flex min-w-0 flex-col leading-tight">
          {line}
          <span className="truncate text-[11px] font-normal text-brass" data-testid="player-title">
            {titleText(t, title)}
          </span>
        </span>
      ) : (
        line
      )}
    </span>
  );
}

/** The chosen frame large (public profile, match introduction); an empty ring without one. */
export function FrameMedallion({
  frame,
  size = 56,
  shine = false,
}: {
  frame: Frame | null;
  size?: number;
  shine?: boolean;
}) {
  const t = useT();
  if (!frame)
    return (
      <span
        aria-hidden
        className="shrink-0 rounded-full border border-stone-700 bg-stone-900"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      data-testid="frame-medallion"
      role="img"
      aria-label={t.frameNames[frame]}
      className="inline-flex shrink-0"
    >
      <Medallion frame={frame} size={size} shine={shine} />
    </span>
  );
}
