import { ACHIEVEMENTS, useAchievements } from "../achievements";
import type { THEMES } from "../board/themes";
import { Card } from "../components/ui";
import { useT } from "../i18n";
import { useOnline } from "../online/store";
import { usePuzzles } from "../puzzle";
import { REWARDS } from "../rewards";
import { useArchive } from "../store/archive";
import { useSettings } from "../store/settings";
import { LESSONS } from "./TutorialScreen";

/** What an achievement unlocks, as text. */
const rewardOf = (t: ReturnType<typeof useT>, id: string): string | null => {
  const styles = Object.entries(REWARDS.style)
    .filter(([, a]) => a === id)
    .map(([s]) => `🎨 ${t.styleNames[s as keyof typeof THEMES]}`);
  const dice = Object.entries(REWARDS.dice)
    .filter(([, a]) => a === id)
    .map(([d]) => `🎲 ${t.diceSkins[d as keyof typeof t.diceSkins]}`);
  const extra = REWARDS.fireworks === id ? [`🎆 ${t.fireworks}`] : [];
  const all = [...styles, ...dice, ...extra];
  return all.length ? all.join(", ") : null;
};

/** All achievements with progress and rewards. */
export function AchievementsPanel() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const unlocked = useAchievements((s) => s.unlocked);
  const lessons = useAchievements((s) => s.lessons);
  const records = useArchive((s) => s.records);
  const puzzles = usePuzzles((s) => s.results);
  const tournaments = useOnline((s) => s.tournaments);
  const me = useOnline((s) => s.profile?.id ?? null);
  const context = {
    records,
    puzzles,
    lessonsSolved: lessons.length,
    lessonsTotal: LESSONS.length,
    profile: null,
    tournaments: Object.values(tournaments),
    me,
  };
  const done = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-stone-100">🏅 {t.achievements}</h2>
        <span className="text-sm tabular-nums text-stone-400">
          {done} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <p className="text-xs text-stone-500">{t.achievementsHint}</p>
      <ul className="grid gap-2 sm:grid-cols-2" data-testid="achievements">
        {ACHIEVEMENTS.map((a) => {
          const open = !!unlocked[a.id];
          const [n, target] = open ? [1, 1] : a.progress(context);
          const reward = rewardOf(t, a.id);
          return (
            <li
              key={a.id}
              className={`flex gap-3 rounded-xl border p-3 ${open ? "border-amber-400/40 bg-amber-400/5" : "border-stone-800"}`}
            >
              <span className={`text-2xl ${open ? "" : "opacity-40 grayscale"}`} aria-hidden>
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className={open ? "font-semibold text-amber-100" : "text-stone-300"}>
                  {a.title[lang]} {open && <span className="sr-only">✓</span>}
                </div>
                <div className="text-xs text-stone-500">{a.text[lang]}</div>
                {!open && target > 1 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={target}
                      aria-valuenow={n}
                    >
                      <div className="h-full bg-amber-500" style={{ width: `${(n / target) * 100}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-stone-500">
                      {n}/{target}
                    </span>
                  </div>
                )}
                {reward && (
                  <div className={`mt-1 text-xs ${open ? "text-emerald-300" : "text-stone-400"}`}>
                    {open ? "✓" : "🔒"} {t.reward}: {reward}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
