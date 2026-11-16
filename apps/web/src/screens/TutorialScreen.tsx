import {
  absFromOwnPoint,
  applyAction,
  type BoardSpec,
  boardFromSpec,
  canConfirm,
  createGame,
  type Dice,
  type GameState,
  getVariant,
  initialBoard,
  type Move,
  type VariantId,
} from "@tavli/engine";
import { useEffect, useMemo, useState } from "react";
import { useAchievements } from "../achievements";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";
import { Icon } from "../components/Icon";
import { Button, Card } from "../components/ui";
import { type Lang, useT } from "../i18n";
import { useBoardTheme } from "../rewards";
import { useSettings } from "../store/settings";
import { usePortraitPhone } from "./GameScreen";
import { useSidewaysBoardStyle } from "./PhoneGame";

type Point = number | "bar" | "off";

/** One guided exercise: a position, a roll and a goal the player has to reach. */
interface Lesson {
  readonly variant: VariantId;
  readonly spec: BoardSpec | "start";
  readonly dice: Dice;
  readonly title: Record<Lang, string>;
  readonly text: Record<Lang, string>;
  readonly done: Record<Lang, string>;
  /** Moves shown by the hint button (white, own point numbers). */
  readonly hint: readonly (readonly [Point, Point, number])[];
  /** Whether the finished turn reached the goal. */
  readonly goal: (s: GameState) => boolean;
}

const own = (s: GameState, point: number) =>
  s.board.points[0][absFromOwnPoint(getVariant(s.variant), 0, point)]!;

export const LESSONS: readonly Lesson[] = [
  {
    variant: "backgammon",
    spec: "start",
    dice: [3, 1],
    title: { de: "1 · Steine ziehen", en: "1 · Moving checkers" },
    text: {
      de: "Du spielst Weiß und ziehst von 24 Richtung 1. Jeder Würfel ist ein eigener Zug. Tippe einen Stein an und dann ein leuchtendes Ziel (oder ziehe ihn). Aufgabe: Baue mit 3-1 einen Punkt auf 5 – zwei Steine auf einem Feld sind sicher.",
      en: "You play White and move from 24 towards 1. Each die is a separate move. Tap a checker, then a highlighted target (or drag it). Task: with 3-1 make the 5 point – two checkers on a point are safe.",
    },
    done: {
      de: "Genau: 8/5 6/5 ist der beste Eröffnungszug mit 3-1.",
      en: "Exactly: 8/5 6/5 is the best opening move with 3-1.",
    },
    hint: [
      [8, 5, 3],
      [6, 5, 1],
    ],
    goal: (s) => own(s, 5) >= 2,
  },
  {
    variant: "backgammon",
    spec: { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 4, 8: 3, 6: 5, 5: 1 } },
    dice: [4, 2],
    title: { de: "2 · Schlagen", en: "2 · Hitting" },
    text: {
      de: "Ein einzelner Stein (Blot) kann geschlagen werden. Schwarz hat einen Blot auf deinem Feld 20. Aufgabe: Schlag ihn – er muss dann auf die Bar.",
      en: "A single checker (blot) can be hit. Black has a blot on your 20 point. Task: hit it – it then goes to the bar.",
    },
    done: {
      de: "Getroffen! Schwarz muss den Stein erst wieder einsetzen, bevor er anders ziehen darf.",
      en: "Hit! Black has to enter that checker again before making any other move.",
    },
    hint: [
      [24, 20, 4],
      [6, 4, 2],
    ],
    goal: (s) => s.board.bar[1] > 0,
  },
  {
    variant: "backgammon",
    spec: {
      white: { 13: 5, 8: 3, 6: 5, 24: 1 },
      black: { 6: 3, 5: 3, 4: 2, 13: 4, 8: 3 },
      bar: [1, 0],
    },
    dice: [5, 3],
    title: { de: "3 · Einsetzen", en: "3 · Entering" },
    text: {
      de: "Einer deiner Steine ist auf der Bar. Er muss zuerst ins gegnerische Heimfeld (deine Felder 24 bis 19) einsteigen – auf ein Feld, das nicht von zwei schwarzen Steinen besetzt ist. Aufgabe: Bring ihn zurück ins Spiel.",
      en: "One of your checkers is on the bar. It must first enter the opponent's home board (your points 24 to 19) on a point not held by two black checkers. Task: bring it back into play.",
    },
    done: {
      de: "Drin! Solange ein Stein auf der Bar ist, darfst du keinen anderen ziehen.",
      en: "In! While a checker is on the bar, you may not move any other.",
    },
    hint: [
      ["bar", 22, 3],
      [13, 8, 5],
    ],
    goal: (s) => s.board.bar[0] === 0,
  },
  {
    variant: "backgammon",
    spec: { white: { 6: 3, 5: 3, 4: 3, 3: 2, 2: 2, 1: 2 }, black: { 6: 5, 5: 5, 4: 5 } },
    dice: [6, 3],
    title: { de: "4 · Abtragen", en: "4 · Bearing off" },
    text: {
      de: "Sind alle 15 Steine in deinem Heimfeld (1 bis 6), trägst du sie ab: Die Augenzahl nimmt einen Stein vom passenden Feld vom Brett. Aufgabe: Trag zwei Steine ab.",
      en: "Once all 15 checkers are in your home board (1 to 6), you bear them off: a die takes a checker from the matching point off the board. Task: bear off two checkers.",
    },
    done: {
      de: "Wer zuerst alle Steine abgetragen hat, gewinnt.",
      en: "Whoever bears off all checkers first wins.",
    },
    hint: [
      [6, "off", 6],
      [3, "off", 3],
    ],
    goal: (s) => s.board.off[0] >= 2,
  },
  {
    variant: "plakoto",
    spec: { white: { 24: 13, 20: 2 }, black: { 24: 13, 8: 1, 7: 1 } },
    dice: [3, 1],
    title: { de: "5 · Plakoto: Einklemmen", en: "5 · Plakoto: pinning" },
    text: {
      de: "In Plakoto wird nicht geschlagen. Landest du auf einem einzelnen gegnerischen Stein, klemmst du ihn ein – er darf nicht ziehen, solange dein Stein darauf steht. Aufgabe: Klemm den schwarzen Stein auf deinem Feld 17 ein.",
      en: "In Plakoto nobody hits. Landing on a single opposing checker pins it – it cannot move while your checker stays on top. Task: pin the black checker on your 17 point.",
    },
    done: {
      de: "Eingeklemmt! Wird der Startstein (die „Mutter“) eingeklemmt, ist das Spiel oft schon entschieden.",
      en: "Pinned! Pinning the opponent's last checker on its starting point (the “mother”) often decides the game.",
    },
    hint: [
      [20, 17, 3],
      [24, 23, 1],
    ],
    goal: (s) => s.board.pinned[absFromOwnPoint(getVariant("plakoto"), 0, 17)] === 1,
  },
  {
    variant: "fevga",
    spec: "start",
    dice: [6, 5],
    title: { de: "6 · Fevga: Läufer zuerst", en: "6 · Fevga: the runner first" },
    text: {
      de: "In Fevga ziehen beide in dieselbe Richtung, und schon ein einzelner Stein besetzt ein Feld. Zu Beginn muss ein Stein (der Läufer) das gegnerische Startfeld passieren, bevor ein zweiter Stein losziehen darf. Aufgabe: Zieh den Läufer mit beiden Würfeln.",
      en: "In Fevga both players move the same way round and a single checker already holds a point. At the start one checker (the runner) has to pass the opponent's starting point before a second checker may leave. Task: move the runner with both dice.",
    },
    done: {
      de: "Gut! Jetzt darf Weiß nach und nach weitere Steine ins Spiel bringen.",
      en: "Good! From now on White may bring more checkers into play.",
    },
    hint: [
      [24, 18, 6],
      [18, 13, 5],
    ],
    goal: (s) => own(s, 13) === 1 && own(s, 24) === 14,
  },
  // Lessons are stored by their index (progress, achievements): new ones go at the end.
  {
    variant: "tavla",
    spec: { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 21: 1, 13: 6, 8: 3, 6: 5 } },
    dice: [2, 5],
    title: { de: "7 · Tavla: Schlagen und stehen bleiben", en: "7 · Tavla: hit and stay" },
    text: {
      de: "Tavla ist türkisches Backgammon ohne Verdopplungswürfel – mit einer Besonderheit: Ein Stein, der im eigenen Heimfeld (1 bis 6) schlägt, muss dort für den Rest des Wurfs stehen bleiben. Aufgabe: Schlag den schwarzen Blot auf 4 und zieh die 5 mit einem anderen Stein.",
      en: "Tavla is Turkish backgammon without a doubling cube – with one twist: a checker that hits in your home board (1 to 6) has to stay there for the rest of the roll. Task: hit the black blot on 4 and play the 5 with another checker.",
    },
    done: {
      de: "Richtig! Der schlagende Stein bleibt auf 4 – „schlagen und weglaufen“ gibt es im Tavla-Heimfeld nicht.",
      en: "Right! The hitter stays on 4 – there is no “hit and run” in a Tavla home board.",
    },
    hint: [
      [6, 4, 2],
      [13, 8, 5],
    ],
    goal: (s) => s.board.bar[1] === 1 && own(s, 4) === 1,
  },
  {
    variant: "tavla",
    spec: { white: { 6: 2, 5: 3, 4: 4, 3: 3, 2: 2, 1: 1 }, black: { 6: 5, 5: 5, 4: 5 } },
    dice: [6, 1],
    title: { de: "8 · Tavla: Abtragen hat Vorrang", en: "8 · Tavla: bearing off comes first" },
    text: {
      de: "Beim Abtragen gilt in Tavla: Kann ein Würfel einen Stein abtragen, muss er das auch tun – Augen verschenken ist nicht erlaubt. Aufgabe: Trag mit 6-1 zwei Steine ab.",
      en: "When bearing off in Tavla, a die that can take a checker off has to do so – wasting pips is not allowed. Task: bear off two checkers with 6-1.",
    },
    done: {
      de: "Genau – die 1 durfte nicht 6/5 oder 2/1 ziehen, sie musste den Stein von 1 abtragen.",
      en: "Exactly – the 1 could not play 6/5 or 2/1, it had to bear off the checker on 1.",
    },
    hint: [
      [6, "off", 6],
      [1, "off", 1],
    ],
    goal: (s) => s.board.off[0] >= 2,
  },
  {
    variant: "narde",
    spec: "start",
    dice: [5, 3],
    title: { de: "9 · Narde: ein Stein vom Kopf", en: "9 · Narde: one checker from the head" },
    text: {
      de: "In Narde stehen alle 15 Steine auf dem „Kopf“ (deinem Feld 24), beide ziehen in dieselbe Richtung, und ein einzelner Stein blockiert ein Feld. Pro Wurf darf nur ein Stein den Kopf verlassen. Aufgabe: Zieh mit 5-3 einen Stein vom Kopf.",
      en: "In Narde all 15 checkers start on the “head” (your 24 point), both players move the same way round and a single checker blocks a point. Only one checker may leave the head per roll. Task: move one checker off the head with 5-3.",
    },
    done: {
      de: "Gut! Der zweite Würfel musste mit demselben Stein gezogen werden.",
      en: "Good! The second die had to be played with the same checker.",
    },
    hint: [
      [24, 19, 5],
      [19, 16, 3],
    ],
    goal: (s) => own(s, 24) === 14 && own(s, 16) === 1,
  },
  {
    variant: "narde",
    spec: "start",
    dice: [6, 6],
    title: { de: "10 · Narde: Sechser-Pasch zu Beginn", en: "10 · Narde: double six to start" },
    text: {
      de: "Ausnahme beim ersten Wurf: Mit 6-6, 4-4 oder 3-3 dürfen zwei Steine den Kopf verlassen – sonst könnte man den Pasch kaum spielen, denn der gegnerische Kopf (dein Feld 12) ist blockiert. Aufgabe: Bring zwei Steine vom Kopf.",
      en: "An exception on the first roll: with 6-6, 4-4 or 3-3 two checkers may leave the head – otherwise the double could hardly be played, as the opponent's head (your 12 point) is blocked. Task: bring two checkers off the head.",
    },
    done: {
      de: "Richtig! Die übrigen Sechsen verfallen, weil das Feld 12 vom Gegner besetzt ist.",
      en: "Right! The remaining sixes are lost because the opponent holds the 12 point.",
    },
    hint: [
      [24, 18, 6],
      [24, 18, 6],
    ],
    goal: (s) => own(s, 24) === 13 && own(s, 18) === 2,
  },
  {
    variant: "hypergammon",
    spec: "start",
    dice: [6, 5],
    title: { de: "11 · Hypergammon: nur drei Steine", en: "11 · Hypergammon: only three checkers" },
    text: {
      de: "Hypergammon spielt nach Backgammon-Regeln, aber jeder hat nur drei Steine – auf den Feldern 24, 23 und 22. Partien sind kurz und jeder Wurf zählt. Aufgabe: Lauf mit 6-5 mit dem hintersten Stein bis auf 13.",
      en: "Hypergammon follows the backgammon rules, but each side has only three checkers – on the 24, 23 and 22 points. Games are short and every roll counts. Task: run your rearmost checker to 13 with 6-5.",
    },
    done: {
      de: "Gelaufen! Im Rennen mit nur drei Steinen entscheidet oft schon ein großer Wurf.",
      en: "Off it goes! With only three checkers a single big roll often decides the race.",
    },
    hint: [
      [24, 18, 6],
      [18, 13, 5],
    ],
    goal: (s) => own(s, 24) === 0 && own(s, 13) === 1,
  },
];

/** The variants with lessons, in the order of the lessons. */
const TUTORIAL_VARIANTS: readonly VariantId[] = [...new Set(LESSONS.map((l) => l.variant))];

const setup = (lesson: Lesson): GameState => {
  const rules = getVariant(lesson.variant);
  const board = lesson.spec === "start" ? initialBoard(rules) : boardFromSpec(rules, lesson.spec);
  return applyAction(createGame({ variant: lesson.variant, board, starter: 0, cube: false }), {
    type: "roll",
    dice: lesson.dice,
  });
};

export const hintMoves = (lesson: Lesson): Move[] => {
  const rules = getVariant(lesson.variant);
  const abs = (p: Point) => (p === "bar" || p === "off" ? p : absFromOwnPoint(rules, 0, p));
  return lesson.hint.map(([from, to, die]) => ({ from: abs(from), to: abs(to), die }) as Move);
};

export { setup as lessonState };

/** Guided lessons on prepared positions: the player moves, the app checks the goal. */
export function TutorialScreen({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const theme = useBoardTheme();
  const portrait = usePortraitPhone();
  const boardStyle = useSidewaysBoardStyle();
  const [index, setIndex] = useState(0);
  const lesson = LESSONS[index]!;
  const [state, setState] = useState(() => setup(lesson));
  const [showHint, setShowHint] = useState(false);
  const layout = useMemo(() => layoutFromBoard(state.board), [state]);
  const finished = state.phase === "moving" && canConfirm(state);
  const success = finished && lesson.goal(state);
  const solveLesson = useAchievements((s) => s.solveLesson);
  const solved = useAchievements((s) => s.lessons);
  useEffect(() => {
    if (success) solveLesson(index);
  }, [success, index, solveLesson]);

  const go = (i: number) => {
    setIndex(i);
    setState(setup(LESSONS[i]!));
    setShowHint(false);
  };
  const play = (chain: Move[]) => {
    let s = state;
    for (const move of chain) s = applyAction(s, { type: "move", move });
    setState(s);
    setShowHint(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-2 sm:p-4 wide:max-w-[min(56rem,max(30rem,calc((100dvh-19rem)*1.45)))]">
      <div className="flex items-center gap-2 px-1">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          <Icon name="back" />
        </Button>
        <h1 className="flex-1 text-xl font-bold text-amber-100">
          <Icon name="school" /> {t.tutorial}
        </h1>
        <span className="text-sm tabular-nums text-stone-500">
          {index + 1} / {LESSONS.length}
        </span>
      </div>
      <nav
        aria-label={t.variant}
        className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]"
      >
        {TUTORIAL_VARIANTS.map((v) => {
          const first = LESSONS.findIndex((l) => l.variant === v);
          const current = lesson.variant === v;
          const done = LESSONS.every((l, i) => l.variant !== v || solved.includes(i));
          return (
            <button
              key={v}
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => go(first)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-amber-400 ${
                current
                  ? "bg-amber-100 font-semibold text-stone-950"
                  : "border border-stone-800 bg-stone-900 text-stone-300 hover:border-stone-600"
              }`}
            >
              {getVariant(v).name}
              {done && (
                <>
                  <Icon name="check" />
                  <span className="sr-only">({t.lessonsDone})</span>
                </>
              )}
            </button>
          );
        })}
      </nav>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold text-amber-200">{lesson.title[lang]}</h2>
        <p className="text-sm leading-relaxed text-stone-300">{lesson.text[lang]}</p>
      </Card>
      <div className="overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/40" style={boardStyle}>
        <Board
          state={state}
          layout={layout}
          theme={theme}
          interactive={!finished}
          openingDice={null}
          numbersFor={0}
          viewer={0}
          onMoves={play}
          hint={showHint && !finished ? hintMoves(lesson) : null}
          rotated={portrait}
        />
      </div>
      <div aria-live="polite" className="min-h-6 text-center">
        {success && (
          <p className="font-semibold text-emerald-300">
            <Icon name="check" /> {lesson.done[lang]}
          </p>
        )}
        {finished && !success && <p className="text-amber-300">{t.tutorialTryAgain}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}>
          <Icon name="prev" /> {t.previous}
        </Button>
        <Button onClick={() => go(index)}>
          <Icon name="undo" /> {t.tutorialReset}
        </Button>
        {!finished && (
          <Button onClick={() => setShowHint(true)}>
            <Icon name="hint" /> {t.hint}
          </Button>
        )}
        {index < LESSONS.length - 1 ? (
          <Button variant={success ? "primary" : "ghost"} onClick={() => go(index + 1)}>
            {t.next} <Icon name="play" />
          </Button>
        ) : (
          <Button variant={success ? "primary" : "ghost"} onClick={onPlay}>
            {t.tutorialPlay} <Icon name="play" />
          </Button>
        )}
      </div>
    </div>
  );
}
