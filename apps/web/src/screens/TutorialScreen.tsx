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
    spec: { white: { 24: 13, 20: 2 }, black: { 24: 13, 8: 1, 1: 1 } },
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
];

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-2 sm:p-4">
      <div className="flex items-center gap-2 px-1">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          ←
        </Button>
        <h1 className="flex-1 text-xl font-bold text-amber-100">🎓 {t.tutorial}</h1>
        <span className="text-sm tabular-nums text-stone-500">
          {index + 1} / {LESSONS.length}
        </span>
      </div>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold text-amber-200">{lesson.title[lang]}</h2>
        <p className="text-sm leading-relaxed text-stone-300">{lesson.text[lang]}</p>
      </Card>
      <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40" style={boardStyle}>
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
        {success && <p className="font-semibold text-emerald-300">✓ {lesson.done[lang]}</p>}
        {finished && !success && <p className="text-amber-300">{t.tutorialTryAgain}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}>
          ◀ {t.previous}
        </Button>
        <Button onClick={() => go(index)}>↺ {t.tutorialReset}</Button>
        {!finished && <Button onClick={() => setShowHint(true)}>💡 {t.hint}</Button>}
        {index < LESSONS.length - 1 ? (
          <Button variant={success ? "primary" : "ghost"} onClick={() => go(index + 1)}>
            {t.next} ▶
          </Button>
        ) : (
          <Button variant={success ? "primary" : "ghost"} onClick={onPlay}>
            {t.tutorialPlay} ▶
          </Button>
        )}
      </div>
    </div>
  );
}
