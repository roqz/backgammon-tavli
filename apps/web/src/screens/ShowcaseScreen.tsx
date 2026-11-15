import { CAREER_VARIANTS, FRAME_IDS, FRAMES } from "@tavli/protocol";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ACHIEVEMENTS, useAchievements } from "../achievements";
import type { BoardStyle } from "../board/themes";
import {
  PLAQUE_WINS,
  plaqueOf,
  rankInfo,
  SEASON_GAMES,
  SHOP,
  seasonGames,
  taskProgress,
  tasksFor,
  tokens,
  useCareer,
  weekId,
  weekRange,
  winterSeason,
} from "../career";
import {
  CheckerPicker,
  CheckerSwatch,
  DicePicker,
  lockText,
  StylePicker,
  StylePreview,
} from "../components/Looks";
import { variantShortName } from "../components/VariantPicker";
import { type Dict, useT } from "../i18n";
import { usePuzzles } from "../puzzle";
import { type CheckerSet, DICE_SKINS, type DiceSkin, FRAME_LOOK, hasLook } from "../rewards";
import { useArchive } from "../store/archive";
import { useSettings } from "../store/settings";
import { AchievementsPanel, RareTag, rewardOf } from "./AchievementsPanel";
import { Page, ScreenTitle } from "./AppShell";
import { LESSONS } from "./TutorialScreen";

const MEDALS = ["#b0764a", "#b9bec4", "#c9a14a"];

/** Everything collected and still to get: club rank, weekly tasks, exchange, plaques, looks, frames. */
export function ShowcaseScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <Page>
      <ScreenTitle title={t.showcase} subtitle={t.showcaseSub} onBack={onBack} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <ClubRank />
          <WeeklyTasks />
          <Exchange />
        </div>
        <div className="flex flex-col gap-6">
          <Plaques />
          <Season />
          <Frames />
        </div>
      </div>
      <Rarities />
      <Box title={t.looksTitle}>
        <StylePicker />
        <DicePicker />
        <CheckerPicker />
      </Box>
      <AchievementsPanel />
    </Page>
  );
}

function Box({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-900/80 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-amber-100">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bar({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-stone-800"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuenow={n}
    >
      <div
        className="h-full bg-felt-400"
        style={{ width: `${Math.min(100, (n / Math.max(1, of)) * 100)}%` }}
      />
    </div>
  );
}

const useCareerData = () =>
  useCareer(
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

function ClubRank() {
  const t = useT();
  const career = useCareerData();
  const lessons = useAchievements((s) => s.lessons);
  const puzzles = usePuzzles((s) => s.results);
  const { points, rank, next } = rankInfo(career, lessons, puzzles);
  return (
    <Box
      title={t.clubRankTitle}
      aside={<span className="text-sm text-stone-400">{t.clubPoints.replace("{n}", String(points))}</span>}
    >
      <p className="font-display text-3xl font-semibold text-stone-50" data-testid="club-rank">
        {t.clubRanks[rank]}
      </p>
      {next !== null ? (
        <>
          <Bar n={points} of={next} label={t.clubRankTitle} />
          <p className="text-sm text-stone-400">
            {t.clubNext.replace("{n}", String(next - points)).replace("{rank}", t.clubRanks[rank + 1]!)}
          </p>
        </>
      ) : (
        <p className="text-sm text-stone-400">{t.clubTop}</p>
      )}
      <p className="text-xs leading-relaxed text-stone-500">{t.clubHow}</p>
    </Box>
  );
}

const taskText = (t: Dict, task: ReturnType<typeof tasksFor>[number]): string =>
  t.tasks[task.kind]
    .replace("{n}", String(task.target))
    .replace("{variant}", task.variant ? variantShortName(task.variant) : "");

function WeeklyTasks() {
  const t = useT();
  const records = useArchive((s) => s.records);
  const puzzles = usePuzzles((s) => s.results);
  const career = useCareerData();
  const week = weekId();
  const range = weekRange();
  const left = Math.max(1, Math.ceil((range[1].getTime() - Date.now()) / 86_400_000));
  const done = career.weeks[week] ?? [];
  return (
    <Box
      title={t.weeklyTitle}
      aside={<span className="text-sm text-stone-400">{t.weeklyLeft.replace("{d}", String(left))}</span>}
    >
      <ul className="flex flex-col gap-3" data-testid="weekly-tasks">
        {tasksFor(week).map((task, i) => {
          const [n, of] = taskProgress(task, records, puzzles, range);
          const ok = done.includes(i) || n >= of;
          return (
            <li key={task.kind} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${ok ? "bg-felt-400 text-stone-50" : "border border-stone-600 text-transparent"}`}
                >
                  ✓
                </span>
                <span className={`flex-1 ${ok ? "text-stone-400 line-through" : "text-stone-100"}`}>
                  {taskText(t, task)}
                </span>
                <span className="text-xs tabular-nums text-stone-400">
                  {n}/{of}
                </span>
              </div>
              {!ok && <Bar n={n} of={of} label={taskText(t, task)} />}
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-stone-500">{t.weeklyHint}</p>
    </Box>
  );
}

function ShopPreview({ kind, look }: { kind: string; look: string }) {
  if (kind === "checkers") return <CheckerSwatch set={look as CheckerSet} />;
  if (kind === "dice") {
    const d = DICE_SKINS[look as Exclude<DiceSkin, "theme">];
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
        style={{ background: d.fill, color: d.pip }}
      >
        ⚃
      </span>
    );
  }
  return (
    <span aria-hidden className="block w-12">
      <StylePreview style={look as BoardStyle} />
    </span>
  );
}

function Exchange() {
  const t = useT();
  const career = useCareerData();
  const unlocked = useAchievements((s) => s.unlocked);
  const take = useCareer((s) => s.take);
  const balance = tokens(career);
  const name = (kind: string, look: string) =>
    kind === "checkers"
      ? t.checkerSets[look as CheckerSet]
      : kind === "dice"
        ? t.diceSkins[look as DiceSkin]
        : t.styleNames[look as BoardStyle];
  return (
    <Box
      title={t.exchangeTitle}
      aside={
        <span className="font-semibold text-amber-300" data-testid="tokens">
          {t.tokens.replace("{n}", String(balance))}
        </span>
      }
    >
      <p className="text-xs leading-relaxed text-stone-500">{t.exchangeHint}</p>
      {[false, true].map((rare) => (
        <ul key={String(rare)} className="flex flex-col divide-y divide-stone-800">
          {rare && (
            <li className="pt-2 pb-1">
              <RareTag />
            </li>
          )}
          {SHOP.filter((o) => !!o.rare === rare).map((item) => {
            const taken = career.owned.includes(item.id);
            const free = !taken && hasLook(item.kind, item.look, unlocked, []);
            return (
              <li key={item.id} className="flex min-h-12 items-center gap-3 py-2">
                <ShopPreview kind={item.kind} look={item.look} />
                <span className="flex-1 text-sm text-stone-200">{name(item.kind, item.look)}</span>
                {taken || free ? (
                  <span className="text-xs text-stone-500">{taken ? t.exchangeDone : t.exchangeHave}</span>
                ) : (
                  <button
                    type="button"
                    disabled={balance < item.price}
                    onClick={() => take(item.id)}
                    className="min-h-9 rounded-lg border border-stone-700 px-3 text-sm text-stone-100 hover:border-amber-400 disabled:opacity-40"
                  >
                    {t.exchangeTake.replace("{n}", String(item.price))}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </Box>
  );
}

/** Long-term goals whose rewards cannot be exchanged. */
function Rarities() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const career = useCareerData();
  const unlocked = useAchievements((s) => s.unlocked);
  const lessons = useAchievements((s) => s.lessons);
  const records = useArchive((s) => s.records);
  const puzzles = usePuzzles((s) => s.results);
  const context = {
    records,
    puzzles,
    lessonsSolved: lessons.length,
    lessonsTotal: LESSONS.length,
    profile: null,
    tournaments: [],
    me: null,
    career,
  };
  return (
    <Box title={t.raritiesTitle}>
      <p className="text-xs leading-relaxed text-stone-500">{t.raritiesHint}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="rarities">
        {ACHIEVEMENTS.filter((a) => a.rare).map((a) => {
          const open = !!unlocked[a.id];
          const [n, of] = open ? [1, 1] : a.progress(context);
          return (
            <li
              key={a.id}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${open ? "border-brass/60 bg-brass/10" : "border-stone-800"}`}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className={`text-3xl ${open ? "" : "opacity-50 grayscale"}`}>
                  {a.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`font-display font-semibold ${open ? "text-brass" : "text-stone-100"}`}>
                    {a.title[lang]}
                  </div>
                  <div className="text-xs text-stone-400">{a.text[lang]}</div>
                </div>
              </div>
              {open ? (
                <p className="text-xs text-stone-300">✓ {unlocked[a.id]?.slice(0, 10)}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Bar n={n} of={of} label={a.title[lang]} />
                  </div>
                  <span className="text-xs tabular-nums text-stone-400">
                    {n}/{of}
                  </span>
                </div>
              )}
              <p className="text-xs text-stone-500">
                {t.reward}: {rewardOf(t, a.id)}
              </p>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

function Plaques() {
  const t = useT();
  const career = useCareerData();
  return (
    <Box title={t.plaquesTitle}>
      <ul className="flex flex-col divide-y divide-stone-800" data-testid="plaques">
        {CAREER_VARIANTS.map((v) => {
          const tier = plaqueOf(career, v);
          const wins = career.winsBy[v] ?? 0;
          return (
            <li key={v} className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="flex-1 text-sm text-stone-100">{variantShortName(v)}</span>
              <span className="text-xs tabular-nums text-stone-400">
                {t.winsCount.replace("{n}", String(wins))}
              </span>
              <span className="flex gap-1">
                {PLAQUE_WINS.map((need, i) => (
                  <span
                    key={need}
                    role="img"
                    aria-label={`${t.plaqueTiers[i]}: ${i < tier ? "✓" : `${wins}/${need}`}`}
                    title={`${t.plaqueTiers[i]} · ${need}`}
                    className="h-5 w-5 rounded-full border"
                    style={
                      i < tier
                        ? { background: MEDALS[i], borderColor: MEDALS[i] }
                        : { borderColor: "#463a2f", background: "transparent" }
                    }
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-stone-500">{t.plaquesHint}</p>
    </Box>
  );
}

function Season() {
  const t = useT();
  const records = useArchive((s) => s.records);
  const unlocked = useAchievements((s) => s.unlocked);
  const owned = useCareer((s) => s.owned);
  const season = winterSeason();
  const n = seasonGames(records);
  const winter = hasLook("style", "winter", unlocked, owned);
  return (
    <Box title={t.seasonTitle}>
      <div className="flex items-center gap-4">
        <span className="block w-24 shrink-0">
          <span className={winter ? "" : "opacity-40 grayscale"}>
            <StylePreview style="winter" />
          </span>
        </span>
        <div className="flex flex-1 flex-col gap-1.5 text-sm">
          {winter ? (
            <p className="text-stone-100">❄️ {t.seasonDone}</p>
          ) : season ? (
            <>
              <p className="text-stone-100">
                {t.seasonNow
                  .replace("{n}", String(Math.min(n, SEASON_GAMES)))
                  .replace("{target}", String(SEASON_GAMES))}
              </p>
              <Bar n={n} of={SEASON_GAMES} label={t.seasonTitle} />
            </>
          ) : (
            <p className="text-stone-400">{t.seasonOff}</p>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-stone-500">
        {t.seasonHint.replace("{n}", String(SEASON_GAMES))}
      </p>
    </Box>
  );
}

function Frames() {
  const t = useT();
  const unlocked = useAchievements((s) => s.unlocked);
  return (
    <Box title={t.framesTitle}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {FRAME_IDS.map((f) => {
          const open = !!unlocked[FRAMES[f]];
          return (
            <li
              key={f}
              title={open ? undefined : lockText(t, FRAMES[f])}
              className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm ${open ? "border-stone-700 text-stone-100" : "border-stone-800 text-stone-500"}`}
            >
              <span
                aria-hidden
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs ring-2 ${FRAME_LOOK[f].ring} ${open ? "" : "opacity-40 grayscale"}`}
              >
                {FRAME_LOOK[f].icon}
              </span>
              <span className="min-w-0 truncate">
                {open ? "" : "🔒 "}
                {t.frameNames[f]}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-stone-500">{t.framesHint}</p>
    </Box>
  );
}
