import type { ProfileResponse } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { describeUnlock, reached, useAchievements } from "../achievements";
import { plaqueIds, seasonIds, taskProgress, tasksFor, useCareer, weekId, weekRange } from "../career";
import { useT } from "../i18n";
import { fetchAccount, fetchProfile, syncArchive, syncProgress } from "../online/client";
import { useOnline } from "../online/store";
import { usePuzzles } from "../puzzle";
import { LESSONS } from "../screens/TutorialScreen";
import { useArchive } from "../store/archive";
import { looksOf, useSettings } from "../store/settings";
import { AchievementBadge } from "./AchievementBadge";

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
    // supporter status (unlocks the supporter looks)
    fetchAccount().catch(() => {});
  }, [profileId, status, matchEnded]);

  // lasting counters first (they outlive the archive), then everything that depends on them
  useEffect(() => {
    useCareer.getState().count(records);
  }, [records]);
  const career = useCareer(
    useShallow((s) => ({
      games: s.games,
      wins: s.wins,
      winsBy: s.winsBy,
      corrFinished: s.corrFinished,
      leagueGames: s.leagueGames,
      expertWins: s.expertWins ?? 0,
      challenged: s.challenged,
      weeks: s.weeks,
      owned: s.owned,
    })),
  );

  useEffect(() => {
    useAchievements.getState().unlock([
      ...reached({
        records,
        puzzles,
        lessonsSolved: lessons.length,
        lessonsTotal: LESSONS.length,
        profile,
        tournaments: Object.values(tournaments),
        me: profileId,
        career,
      }),
      ...plaqueIds(career),
      ...seasonIds(records),
    ]);
    // this week's tasks
    const week = weekId();
    const range = weekRange();
    const done = tasksFor(week)
      .map((task, i) => (taskProgress(task, records, puzzles, range)[0] >= task.target ? i : -1))
      .filter((i) => i >= 0);
    if (done.length) useCareer.getState().markTasks(week, done);
  }, [records, puzzles, lessons, profile, tournaments, profileId, career]);

  // keep achievements, lessons, puzzle results and the chosen looks with the profile (all devices)
  const unlocked = useAchievements((s) => s.unlocked);
  const looksAt = useSettings((s) => s.looksAt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: looksAt sends a new choice of looks up too
  useEffect(() => {
    if (!profileId || status !== "ready") return;
    const id = setTimeout(() => {
      const puzzleResults = Object.fromEntries(
        Object.entries(puzzles).map(([d, r]) => [
          d,
          { solved: r.solved, loss: Number.isFinite(r.loss) ? r.loss : null },
        ]),
      );
      const looks = looksOf(useSettings.getState());
      syncProgress({ unlocked, lessons, puzzles: puzzleResults, career, ...(looks ? { looks } : {}) })
        .then((merged) => {
          useAchievements.getState().absorb(merged.unlocked, merged.lessons);
          usePuzzles.getState().absorb(merged.puzzles);
          if (merged.career) useCareer.getState().absorb(merged.career);
          if (merged.looks) useSettings.getState().absorbLooks(merged.looks);
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [profileId, status, unlocked, lessons, puzzles, career, looksAt]);

  // the game archive with its replays on every device: after connecting and after each game
  const newest = records[0]?.id ?? "";
  const count = records.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: newest and count mark a changed archive
  useEffect(() => {
    if (!profileId || status !== "ready") return;
    const id = setTimeout(() => void syncArchive().catch(() => {}), 2500);
    return () => clearTimeout(id);
  }, [profileId, status, newest, count]);

  return <AchievementToast />;
}

function AchievementToast() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const fresh = useAchievements((s) => s.fresh[0] ?? null);
  const dismiss = useAchievements((s) => s.dismiss);
  const a = useMemo(() => (fresh ? describeUnlock(fresh, t, lang) : null), [fresh, t, lang]);
  useEffect(() => {
    if (!fresh) return;
    // nothing to show for it: on to the next one
    if (!a) return dismiss();
    const id = setTimeout(dismiss, 4000);
    return () => clearTimeout(id);
  }, [fresh, dismiss, a]);
  return (
    <AnimatePresence>
      {a && fresh && (
        <motion.button
          key={fresh}
          type="button"
          role="status"
          onClick={dismiss}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-amber-400/50 bg-stone-900 px-4 py-3 text-left shadow-2xl"
        >
          <AchievementBadge a={{ badge: a.badge, tint: a.tint, rare: a.rare }} size={44} />
          <span>
            <span className="block text-xs uppercase tracking-wider text-amber-300">
              {t.achievementUnlocked}
            </span>
            <span className="block font-semibold text-stone-100">{a.title}</span>
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
