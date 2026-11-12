import type { Frame } from "@tavli/protocol";
import { useT } from "../i18n";
import { FRAME_LOOK } from "../rewards";

/** A player's name with the avatar frame they chose (an unlocked reward). */
export function PlayerName({
  name,
  frame,
  className = "",
}: {
  name: string;
  frame?: Frame | null;
  className?: string;
}) {
  const t = useT();
  if (!frame) return <span className={className}>{name}</span>;
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
    </span>
  );
}
