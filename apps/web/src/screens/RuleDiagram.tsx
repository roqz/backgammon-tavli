import {
  absFromOwnPoint,
  applyAction,
  type BoardSpec,
  boardFromSpec,
  createGame,
  type Dice,
  type GameState,
  getVariant,
  initialBoard,
  type Move,
  type VariantId,
} from "@tavli/engine";
import { useMemo } from "react";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";
import type { Lang } from "../i18n";
import { useBoardTheme } from "../rewards";

type Point = number | "bar" | "off";

/** A position for the rule book: white (bottom) to move, with arrows for the moves shown. */
interface Diagram {
  readonly variant: VariantId;
  /** "start" = the variant's starting position. */
  readonly spec: BoardSpec | "start";
  readonly dice?: Dice;
  /** Moves of white in own point numbers: [from, to, die]. */
  readonly moves?: readonly (readonly [Point, Point, number])[];
  readonly caption: Record<Lang, string>;
}

export const DIAGRAMS = {
  direction: {
    variant: "backgammon",
    spec: "start",
    dice: [6, 5],
    moves: [
      [24, 18, 6],
      [18, 13, 5],
    ],
    caption: {
      de: "Weiß zieht gegen den Uhrzeigersinn von 24 Richtung 1 (Heimfeld unten rechts). Mit 6-5 läuft ein hinterer Stein von 24 nach 13.",
      en: "White moves counter-clockwise from 24 towards 1 (home board bottom right). With 6-5 a back checker runs from 24 to 13.",
    },
  },
  hit: {
    variant: "backgammon",
    spec: { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 4, 8: 3, 6: 5, 5: 1 } },
    dice: [4, 2],
    moves: [
      [24, 20, 4],
      [6, 4, 2],
    ],
    caption: {
      de: "Schwarz hat einen einzelnen Stein (Blot) auf Weiß’ 20. Weiß schlägt ihn mit der 4 (24/20*); der Stein muss auf die Bar und von dort neu einsteigen.",
      en: "Black has a single checker (blot) on White’s 20. White hits it with the 4 (24/20*); it goes to the bar and has to enter again.",
    },
  },
  bearoff: {
    variant: "backgammon",
    spec: { white: { 6: 3, 5: 3, 4: 3, 3: 2, 2: 2, 1: 2 }, black: { 6: 5, 5: 5, 4: 5 } },
    dice: [6, 3],
    moves: [
      [6, "off", 6],
      [3, "off", 3],
    ],
    caption: {
      de: "Alle weißen Steine sind im Heimfeld: Jetzt wird abgetragen. 6-3 trägt je einen Stein von 6 und 3 ab.",
      en: "All white checkers are in the home board, so they are borne off: 6-3 takes one checker each from 6 and 3.",
    },
  },
  plakotoStart: {
    variant: "plakoto",
    spec: "start",
    caption: {
      de: "Plakoto: Alle 15 Steine beginnen auf dem eigenen Feld 24, die Spieler ziehen gegeneinander rund ums Brett.",
      en: "Plakoto: all 15 checkers start on the own 24 point; the players move round the board towards each other.",
    },
  },
  pin: {
    variant: "plakoto",
    spec: { white: { 24: 13, 20: 2 }, black: { 24: 13, 8: 1, 1: 1 } },
    dice: [3, 1],
    moves: [[20, 17, 3]],
    caption: {
      de: "Weiß landet auf dem einzelnen schwarzen Stein (Weiß’ 17) und klemmt ihn ein: Er darf nicht ziehen, solange der weiße Stein darauf steht.",
      en: "White lands on the single black checker (White’s 17) and pins it: it cannot move while the white checker stays on top.",
    },
  },
  fevgaStart: {
    variant: "fevga",
    spec: "start",
    caption: {
      de: "Fevga: Beide Spieler beginnen mit 15 Steinen auf ihrem Feld 24 in gegenüberliegenden Ecken und ziehen in dieselbe Richtung.",
      en: "Fevga: both players start with 15 checkers on their 24 point in opposite corners and move the same way round.",
    },
  },
  fevgaPrime: {
    variant: "fevga",
    spec: { white: { 24: 10, 17: 1, 16: 1, 15: 1, 14: 1, 13: 1 }, black: { 24: 15 } },
    caption: {
      de: "Weiß hält fünf Punkte in Folge (17 bis 13). Einen sechsten Punkt direkt daneben darf Weiß nur besetzen, wenn schon ein schwarzer Stein vor dieser Sperre steht.",
      en: "White holds five points in a row (17 to 13). White may take a sixth point next to them only if a black checker is already ahead of the block.",
    },
  },
  tavlaHit: {
    variant: "tavla",
    spec: { white: { 8: 1, 13: 5, 6: 5, 3: 2, 24: 2 }, black: { 21: 1, 13: 5, 8: 3, 6: 6 } },
    dice: [4, 2],
    moves: [
      [8, 4, 4],
      [13, 11, 2],
    ],
    caption: {
      de: "Tavla: Weiß schlägt mit 8/4 im eigenen Heimfeld. Der schlagende Stein bleibt stehen – die 2 muss ein anderer Stein ziehen (hier 13/11).",
      en: "Tavla: White hits with 8/4 in its own home board. The hitting checker stays – another checker plays the 2 (here 13/11).",
    },
  },
  nardeStart: {
    variant: "narde",
    spec: "start",
    caption: {
      de: "Narde: Alle 15 Steine beginnen auf dem Kopf, die Köpfe liegen sich diagonal gegenüber; beide ziehen in dieselbe Richtung.",
      en: "Narde: all 15 checkers start on the head, the heads are diagonally opposite; both move the same way round.",
    },
  },
  nardeHead: {
    variant: "narde",
    spec: { white: { 24: 14, 21: 1 }, black: { 24: 15 } },
    dice: [5, 3],
    moves: [
      [24, 19, 5],
      [21, 18, 3],
    ],
    caption: {
      de: "Narde: Nur ein Stein pro Wurf darf den Kopf verlassen. Bei 5-3 zieht also 24/19, die 3 spielt ein Stein, der schon unterwegs ist.",
      en: "Narde: only one checker per roll may leave the head. With 5-3, 24/19 is played and the 3 goes to a checker already on its way.",
    },
  },
} satisfies Record<string, Diagram>;

export type DiagramId = keyof typeof DIAGRAMS;

export const stateOf = (d: Diagram): { state: GameState; hint: Move[] | null } => {
  const rules = getVariant(d.variant);
  const board = d.spec === "start" ? initialBoard(rules) : boardFromSpec(rules, d.spec);
  let state = createGame({ variant: d.variant, board, starter: 0, cube: false });
  if (d.dice) state = applyAction(state, { type: "roll", dice: d.dice });
  const abs = (p: Point) => (p === "bar" || p === "off" ? p : absFromOwnPoint(rules, 0, p as number));
  const hint = d.moves?.map(([from, to, die]) => ({ from: abs(from), to: abs(to), die }) as Move) ?? null;
  return { state, hint };
};

/** A small, read-only board with arrows and a caption, inside a rule chapter. */
export function RuleDiagram({ id, lang }: { id: DiagramId; lang: Lang }) {
  const d: Diagram = DIAGRAMS[id];
  const theme = useBoardTheme();
  const { state, hint } = useMemo(() => stateOf(d), [d]);
  const layout = useMemo(() => layoutFromBoard(state.board), [state]);
  return (
    <figure className="my-2 flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-xl ring-1 ring-black/40">
        <Board
          state={state}
          layout={layout}
          theme={theme}
          interactive={false}
          openingDice={null}
          numbersFor={0}
          viewer={0}
          onMoves={() => {}}
          hint={hint}
        />
      </div>
      <figcaption className="text-xs leading-relaxed text-stone-400">{d.caption[lang]}</figcaption>
    </figure>
  );
}
