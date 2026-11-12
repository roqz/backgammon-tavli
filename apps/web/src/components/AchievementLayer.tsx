import type { ProfileResponse } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ACHIEVEMENTS, reached, useAchievements } from "../achievements";
import { useT } from "../i18n";
import { fetchProfile } from "../online/client";
import { useOnline } from "../online/store";
import { usePuzzles } from "../puzzle";
import { LESSONS } from "../screens/TutorialScreen";
import { useArchive } from "../store/archive";
import { useSettings } from "../store/settings";

/**
 * Watches games, puzzles, tutorial and online profile, unlocks achievements and announces new
 * ones one after the other.
 */
export function AchievementLayer() {
  const records = useArchive((s) => s.records);
  const puzzles = usePuzzles((s) => s.results);
  const lessons = useAchievements((s) => s.lessons);
  const profileId = useOnline((s) => s.profile?.id ?? null);
  const status = useOnline((s) => s.status);
  const matchEnded = useOnline((s) => s.match?.end ?? null);
  const tournaments = useOnline((s) => s.tournaments);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);

  // the own online profile (ratings, wins), again after every online match
  // biome-ignore lint/correctness/useExhaustiveDependencies: matchEnded triggers the refetch
  useEffect(() => {
    if (!profileId || status !== "ready") return;
    fetchProfile(profileId)
      .then(setProfile)
      .catch(() => {});
  }, [profileId, status, matchEnded]);

  useEffect(() => {
    useAchievements.getState().unlock(
      reached({
        records,
        puzzles,
        lessonsSolved: lessons.length,
        lessonsTotal: LESSONS.length,
        profile,
        tournaments: Object.values(tournaments),
        me: profileId,
      }),
    );
  }, [records, puzzles, lessons, profile, tournaments, profileId]);

  return <AchievementToast />;
}

function AchievementToast() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const fresh = useAchievements((s) => s.fresh[0] ?? null);
  const dismiss = useAchievements((s) => s.dismiss);
  const a = useMemo(() => ACHIEVEMENTS.find((x) => x.id === fresh), [fresh]);
  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(dismiss, 4000);
    return () => clearTimeout(id);
  }, [fresh, dismiss]);
  return (
    <AnimatePresence>
      {a && (
        <motion.button
          key={a.id}
          type="button"
          role="status"
          onClick={dismiss}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-amber-400/50 bg-stone-900 px-4 py-3 text-left shadow-2xl"
        >
          <span className="text-3xl" aria-hidden>
            {a.icon}
          </span>
          <span>
            <span className="block text-xs uppercase tracking-wider text-amber-300">
              {t.achievementUnlocked}
            </span>
            <span className="block font-semibold text-stone-100">{a.title[lang]}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

const COLORS = ["#fbbf24", "#f87171", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"];

/** Confetti over the board after a won game (a reward; skipped with reduced motion). */
export function Fireworks() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        rotate: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length]!,
      })),
    [],
  );
  const reduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 h-3 w-2 rounded-sm"
          style={{ left: `${p.x}%`, background: p.color }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: 2.4, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
