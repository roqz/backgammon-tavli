import type { PublicPlayer } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { RankMark } from "../components/Medallion";
import { FrameMedallion, titleText } from "../components/PlayerName";
import { useT } from "../i18n";

const SHOW_MS = 2600;

/**
 * Introduction of both players when an online match begins (design doc, proposal 1): large
 * medallions, titles, club ranks and ratings for a moment, like players walking in. A tap closes
 * it; reconnecting to a running match does not show it again.
 */
export function MatchIntro({
  matchId,
  players,
}: {
  matchId: string;
  players: readonly [PublicPlayer, PublicPlayer];
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new match shows the introduction again
  useEffect(() => {
    setOpen(true);
    const id = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(id);
  }, [matchId]);
  const side = (p: PublicPlayer) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <FrameMedallion frame={p.frame ?? null} size={64} shine />
      <span className="flex max-w-full items-center gap-1 font-display text-lg font-semibold text-stone-50">
        <span className="truncate">{p.name}</span>
        {(p.rank ?? 0) > 0 && <RankMark rank={p.rank ?? 0} label={t.clubRanks[p.rank ?? 0]} />}
      </span>
      {p.title && <span className="max-w-full truncate text-xs text-brass">{titleText(t, p.title)}</span>}
      {p.frame && !p.title && <span className="text-xs text-brass">{t.frameNames[p.frame]}</span>}
      <span className="text-sm tabular-nums text-stone-300">{p.rating}</span>
    </div>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.button
          type="button"
          data-testid="match-intro"
          aria-label={`${players[0].name} ${t.introVs} ${players[1].name}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-brass/40 bg-stone-900/95 px-4 py-5 shadow-2xl"
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            {side(players[0])}
            <span className="shrink-0 font-display text-sm uppercase tracking-widest text-stone-500">
              {t.introVs}
            </span>
            {side(players[1])}
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
