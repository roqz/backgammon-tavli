import type { Frame } from "@tavli/protocol";
import { useT } from "../i18n";
import { FRAME_LOOK } from "../rewards";

/** A player's name with the avatar frame they chose (an unlocked reward). */
export function PlayerName({
  name,
  frame,
  rank = 0,
  supporter = false,
  className = "",
}: {
  name: string;
  frame?: Frame | null;
  /** Club rank: from 1 (regular) on a small brass mark after the name. */
  rank?: number;
  /** Supports the project: a small brass heart. */
  supporter?: boolean;
  className?: string;
}) {
  const t = useT();
  const heart = supporter && (
    <span
      className="ml-1 shrink-0 text-[11px] leading-none text-brass"
      title={t.supporterBadge}
      role="img"
      aria-label={t.supporterBadge}
    >
      ♥
    </span>
  );
  const badge = rank > 0 && (
    <span
      className="ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm border border-brass/60 px-0.5 font-display text-[10px] leading-none text-brass"
      title={t.clubRanks[rank]}
      role="img"
      aria-label={`${t.clubRankTitle}: ${t.clubRanks[rank]}`}
    >
      {RANK_MARK[rank]}
    </span>
  );
  if (!frame)
    return (
      <span className={`inline-flex min-w-0 items-center ${className}`}>
        <span className="truncate">{name}</span>
        {heart}
        {badge}
      </span>
    );
  const look = FRAME_LOOK[frame];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] ring-2 ${look.ring}`}
        title={t.frameNames[frame]}
        role="img"
        aria-label={t.frameNames[frame]}
      >
        {look.icon}
      </span>
      <span className="truncate">{name}</span>
      {heart}
      {badge}
    </span>
  );
}

/** Marks of the club ranks (0 = guest has none). */
const RANK_MARK = ["", "I", "II", "III", "★"];

/** The chosen frame large (public profile); an empty ring without one. */
export function FrameMedallion({ frame }: { frame: Frame | null }) {
  const t = useT();
  if (!frame)
    return (
      <span aria-hidden className="h-14 w-14 shrink-0 rounded-full border border-stone-700 bg-stone-900" />
    );
  const look = FRAME_LOOK[frame];
  return (
    <span
      className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-stone-900 text-3xl ring-4 ${look.ring}`}
      title={t.frameNames[frame]}
      role="img"
      aria-label={t.frameNames[frame]}
      data-testid="frame-medallion"
    >
      {look.icon}
    </span>
  );
}
