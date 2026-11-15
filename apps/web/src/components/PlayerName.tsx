import type { Frame } from "@tavli/protocol";
import { useT } from "../i18n";
import { FRAME_LOOK } from "../rewards";

/** A player's name with the avatar frame they chose (an unlocked reward). */
export function PlayerName({
  name,
  frame,
  rank = 0,
  className = "",
}: {
  name: string;
  frame?: Frame | null;
  /** Club rank: from 1 (regular) on a small brass mark after the name. */
  rank?: number;
  className?: string;
}) {
  const t = useT();
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
      {badge}
    </span>
  );
}

/** Marks of the club ranks (0 = guest has none). */
const RANK_MARK = ["", "I", "II", "III", "★"];
