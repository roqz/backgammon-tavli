/**
 * The rule book shown in the app. It describes exactly what the engine implements
 * (packages/engine), including the interpretations chosen where house rules differ.
 */
import type { Lang } from "./i18n";

export type RulesTopic = "general" | "backgammon" | "portes" | "plakoto" | "fevga" | "tavli" | "app";

export interface RulesSection {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

export interface RulesChapter {
  readonly label: string;
  readonly intro: string;
  readonly sections: readonly RulesSection[];
}

export const RULES_TOPICS: readonly RulesTopic[] = [
  "general",
  "backgammon",
  "portes",
  "plakoto",
  "fevga",
  "tavli",
  "app",
];

const de: Record<RulesTopic, RulesChapter> = {
  general: {
    label: "Grundlagen",
    intro:
      "Alle Varianten werden auf demselben Brett mit 24 Feldern (Punkten) und je 15 Steinen gespielt. Ziel ist es, alle eigenen Steine ins Heimfeld zu bringen und dort abzutragen.",
    sections: [
      {
        title: "Brett und Zugrichtung",
        bullets: [
          "Die Felder sind aus Sicht jedes Spielers von 24 (Start) bis 1 nummeriert; das Heimfeld sind die Felder 6 bis 1.",
          "In der App liegt dein Startpunkt immer oben rechts und dein Heimfeld unten rechts – das Brett wird für Schwarz entsprechend gedreht.",
          "Ein Stein zieht so viele Felder vorwärts, wie der Würfel zeigt. Jeder Würfel ist ein eigener Zug; beide Würfel dürfen mit demselben Stein gezogen werden.",
          "Bei einem Pasch wird die Augenzahl viermal gezogen.",
        ],
      },
      {
        title: "Wer beginnt?",
        bullets: [
          "Beide Spieler würfeln je einen Würfel; die höhere Zahl beginnt. Bei Gleichstand wird erneut gewürfelt.",
          "Backgammon: Der Beginnende spielt die beiden Eröffnungswürfel als ersten Zug.",
          "Portes, Plakoto, Fevga: Der Beginnende würfelt danach neu.",
          "Im Tavli-Match beginnt ab dem zweiten Spiel der Gewinner des vorherigen Spiels.",
        ],
      },
      {
        title: "Zugpflicht",
        bullets: [
          "Es müssen so viele Würfel wie möglich gespielt werden. Erlaubt nur eine Reihenfolge beide Würfel, muss diese gewählt werden.",
          "Kann nur einer von zwei verschiedenen Würfeln gespielt werden, muss – wenn möglich – der höhere gespielt werden.",
          "Ein Zug, der das Spiel sofort beendet (letzter Stein abgetragen, Mana in Plakoto), zählt als vollständig gespielt.",
          "Ist gar kein Zug möglich, verfällt der Wurf („kein Zug möglich“).",
        ],
      },
      {
        title: "Abtragen",
        bullets: [
          "Abgetragen werden darf erst, wenn alle eigenen Steine im Heimfeld stehen (keiner auf der Bar oder außerhalb).",
          "Ein Stein wird mit der passenden Augenzahl abgetragen (z. B. eine 4 vom Feld 4).",
          "Eine höhere Augenzahl darf nur verwendet werden, wenn auf höheren Feldern keine eigenen Steine mehr stehen.",
        ],
      },
      {
        title: "Wertung",
        bullets: [
          "Ein normaler Sieg zählt 1 Punkt.",
          "Hat der Verlierer noch keinen Stein abgetragen, ist es ein Gammon (Backgammon) bzw. Mars (Tavli) und zählt 2 Punkte.",
          "Nur im Backgammon gibt es zusätzlich den Backgammon-Sieg mit 3 Punkten (siehe Backgammon).",
          "Aufgeben ist jederzeit möglich; dabei wählt man, ob einfach, Gammon/Mars oder Backgammon abgegeben wird.",
        ],
      },
    ],
  },
  backgammon: {
    label: "Backgammon",
    intro: "Die international bekannte Variante – mit Schlagen und Verdopplungswürfel.",
    sections: [
      {
        title: "Aufstellung",
        bullets: ["Je Spieler: 2 Steine auf Feld 24, 5 auf Feld 13, 3 auf Feld 8 und 5 auf Feld 6."],
      },
      {
        title: "Schlagen und Bar",
        bullets: [
          "Ein einzelner Stein auf einem Feld ist ein „Blot“. Landet ein gegnerischer Stein darauf, wird er geschlagen und auf die Bar gesetzt.",
          "Ein Feld mit zwei oder mehr gegnerischen Steinen ist blockiert.",
          "Steine auf der Bar müssen zuerst wieder eingesetzt werden – im gegnerischen Heimfeld, auf dem Feld 25 minus Augenzahl. Erst dann dürfen andere Steine ziehen.",
          "Sind alle sechs Einsetzfelder blockiert („ausgesperrt“), entfällt der Zug ohne Würfeln.",
        ],
      },
      {
        title: "Verdopplungswürfel",
        bullets: [
          "Vor dem eigenen Wurf darf man verdoppeln, solange der Würfel in der Mitte liegt oder einem selbst gehört.",
          "Der Gegner nimmt an (der Würfelwert verdoppelt sich, der Würfel gehört nun ihm) oder gibt auf und verliert den bisherigen Wert.",
          "Der Endstand eines Spiels wird mit dem Würfelwert multipliziert.",
          "Kein Verdoppeln im 1-Punkt-Match und im Crawford-Spiel.",
        ],
      },
      {
        title: "Wertung",
        bullets: [
          "Einfacher Sieg: 1 × Würfelwert.",
          "Gammon: Der Verlierer hat keinen Stein abgetragen – 2 × Würfelwert.",
          "Backgammon: Zusätzlich steht beim Verlierer noch ein Stein auf der Bar oder im Heimfeld des Gewinners – 3 × Würfelwert.",
          "Jacoby-Regel (nur bei unbegrenzten Sitzungen): Gammons und Backgammons zählen nur, wenn verdoppelt wurde.",
        ],
      },
      {
        title: "Match und Crawford-Regel",
        bullets: [
          "Ein Match geht auf eine feste Punktzahl (1, 3, 5, 7) oder unbegrenzt.",
          "Erreicht ein Spieler erstmals „Matchlänge minus 1“, darf im folgenden Spiel (Crawford-Spiel) nicht verdoppelt werden; danach wieder.",
        ],
      },
    ],
  },
  portes: {
    label: "Portes",
    intro:
      "Die griechische Schwester des Backgammon – gleiche Aufstellung und Schlagregeln, aber ohne Verdopplungswürfel.",
    sections: [
      {
        title: "Regeln",
        bullets: [
          "Aufstellung, Zugrichtung, Schlagen, Bar und Einsetzen wie im Backgammon.",
          "Kein Verdopplungswürfel.",
          "Der Gewinner des Anwurfs würfelt neu, statt die Eröffnungswürfel zu spielen.",
        ],
      },
      {
        title: "Wertung",
        bullets: [
          "Sieg: 1 Punkt. Mars (der Verlierer hat keinen Stein abgetragen): 2 Punkte.",
          "Einen dreifachen Backgammon-Sieg gibt es nicht.",
        ],
      },
    ],
  },
  plakoto: {
    label: "Plakoto",
    intro: "Statt zu schlagen werden gegnerische Steine eingeklemmt („plakono“ = ich drücke nieder).",
    sections: [
      {
        title: "Aufstellung und Richtung",
        bullets: [
          "Alle 15 Steine beginnen auf dem eigenen Startfeld 24 (das Feld 1 des Gegners).",
          "Die Spieler ziehen in entgegengesetzte Richtungen wie im Backgammon.",
        ],
      },
      {
        title: "Einklemmen",
        bullets: [
          "Landet ein Stein auf einem einzelnen gegnerischen Stein, wird dieser eingeklemmt; er bleibt liegen und kann nicht ziehen.",
          "Der eingeklemmte Stein wird erst frei, wenn alle einklemmenden Steine das Feld verlassen haben.",
          "Ein Feld, auf dem der Gegner oben liegt, ist für den eingeklemmten Spieler blockiert; der Einklemmende darf weitere eigene Steine dazusetzen.",
          "Felder mit zwei oder mehr gegnerischen Steinen sind blockiert. Es gibt keine Bar.",
          "Solange ein eigener Stein außerhalb des Heimfelds eingeklemmt ist, kann nicht abgetragen werden.",
        ],
      },
      {
        title: "Mana",
        bullets: [
          "Wer den letzten Stein des Gegners auf dessen Startfeld (die „Mutter“) einklemmt, gewinnt sofort mit 2 Punkten.",
        ],
      },
      {
        title: "Wertung",
        bullets: [
          "Sieg: 1 Punkt. Mars (keinen Stein abgetragen) oder Mana: 2 Punkte. Kein Verdopplungswürfel.",
        ],
      },
    ],
  },
  fevga: {
    label: "Fevga",
    intro:
      "Beide Spieler laufen in dieselbe Richtung – es wird weder geschlagen noch eingeklemmt, sondern blockiert.",
    sections: [
      {
        title: "Aufstellung und Richtung",
        bullets: [
          "Alle 15 Steine beginnen auf dem eigenen Startfeld; die Startfelder liegen sich diagonal gegenüber.",
          "Beide Spieler ziehen gegen den Uhrzeigersinn um das ganze Brett.",
        ],
      },
      {
        title: "Blockieren",
        bullets: [
          "Schon ein einzelner Stein hält ein Feld: Auf Felder mit gegnerischen Steinen darf nicht gezogen werden.",
          "Es gibt kein Schlagen, kein Einklemmen und keine Bar.",
        ],
      },
      {
        title: "Startregel",
        bullets: [
          "Bevor ein zweiter Stein das Startfeld verlassen darf, muss der erste Stein das Startfeld des Gegners passiert haben.",
          "Auslegung in dieser App: Ist dieser erste Stein blockiert, dürfen ausnahmsweise andere Steine ziehen.",
        ],
      },
      {
        title: "Blockade-Verbot",
        bullets: [
          "Eine Sperre aus sechs aufeinanderfolgenden Feldern ist verboten, solange kein gegnerischer Stein schon vor ihr steht.",
          "Auslegung in dieser App: Die Regel wird nach jedem einzelnen Zug geprüft, nicht erst am Ende des Wurfs.",
        ],
      },
      {
        title: "Wertung",
        bullets: ["Sieg: 1 Punkt. Mars (keinen Stein abgetragen): 2 Punkte. Kein Verdopplungswürfel."],
      },
    ],
  },
  tavli: {
    label: "Tavli-Match",
    intro: "So wird in Griechenland gespielt: die drei Varianten im Wechsel.",
    sections: [
      {
        title: "Ablauf",
        bullets: [
          "Die Spiele wechseln in fester Reihenfolge: Portes → Plakoto → Fevga → Portes …",
          "Das Match geht auf eine feste Punktzahl, üblich sind 5 oder 7 Punkte.",
          "Ab dem zweiten Spiel beginnt der Gewinner des vorherigen Spiels (ohne Anwurf).",
          "Die Punkte werden nach der Wertung der jeweiligen Variante vergeben.",
        ],
      },
    ],
  },
  app: {
    label: "App & Notation",
    intro: "Wie die App die Regeln umsetzt und wie der Spielverlauf zu lesen ist.",
    sections: [
      {
        title: "Notation im Verlauf",
        bullets: [
          "„64: 24/18 13/9“ – Wurf 6-4, ein Stein von 24 nach 18 und einer von 13 nach 9 (Felder aus Sicht des Ziehenden).",
          "„*“ markiert einen geschlagenen bzw. eingeklemmten Stein, „(2)“ einen wiederholten Zug, „bar“ die Bar, „off“ das Abtragen.",
          "Mehrere Züge desselben Steins werden zusammengefasst: „24/13“ statt „24/18 18/13“.",
        ],
      },
      {
        title: "Bedienung",
        bullets: [
          "Stein antippen, dann ein hervorgehobenes Ziel antippen – oder den Stein ziehen. Ziele über beide Würfel werden direkt angeboten.",
          "Innerhalb des eigenen Wurfs lassen sich Züge zurücknehmen, bis der Zug beendet ist.",
          "Automatisch würfeln und Zug beenden sind in den Einstellungen einstellbar, jeweils mit abbrechbarem 3-Sekunden-Countdown.",
        ],
      },
      {
        title: "Aufgeben",
        bullets: [
          "Gegen den Computer und online bietest du die Aufgabe an, wenn du am Zug bist: einfach, Gammon/Mars oder Backgammon. Der Gegner nimmt an (das Spiel endet mit diesem Ergebnis) oder lehnt ab (es geht normal weiter). Online ist ein Angebot pro Zug möglich, die Antwortzeit beträgt 30 Sekunden.",
          "Sofort aufgeben ohne Zustimmung gibt das höchste noch mögliche Ergebnis ab – kein Gammon mehr möglich, sobald du einen Stein abgetragen hast.",
          "Der Computer nimmt ein Angebot an, wenn es mindestens so viel bringt, wie er beim Weiterspielen erwartet – im Match gemessen an der Chance, das Match zu gewinnen.",
          "Am selben Gerät wählt der Aufgebende das Ergebnis direkt.",
        ],
      },
      {
        title: "Stellungen (XGID)",
        bullets: [
          "Backgammon- und Portes-Stellungen lassen sich als XGID kopieren (Seitenleiste) und beim neuen Spiel importieren – kompatibel mit eXtreme Gammon, GNU Backgammon und den meisten Analyseprogrammen.",
        ],
      },
      {
        title: "Online",
        bullets: [
          "Der Server würfelt und prüft jeden Zug – Manipulation im Browser ist wirkungslos.",
          "Nachweisbar faire Würfel: Zu Matchbeginn legt sich der Server per Hash auf einen geheimen Zufallswert fest, beide Browser steuern eigene Zufallswerte bei, und jeder Wurf wird daraus per HMAC-SHA256 abgeleitet. Am Ende legt der Server alles offen und die App rechnet jeden Wurf nach („Würfel nachgeprüft“).",
          "Zugzeit: 60 Sekunden (Antwort auf eine Verdopplung: 30 Sekunden). Läuft sie ab, zieht der Computer für dich; nach drei Zeitüberschreitungen ist das Match verloren.",
          "Nach einem Verbindungsabbruch hast du 90 Sekunden, um zurückzukehren.",
          "Rating nach der FIBS-Formel, getrennt pro Variante; neue Spieler gewinnen und verlieren anfangs schneller Punkte.",
          "Fair Play: Zwei Profile vom selben Gerät oder Netzwerk werden in der Gegnersuche nie gepaart; private Partien zwischen ihnen sind ungewertet. Gegen denselben Gegner zählen höchstens 3 gewertete Matches pro 24 Stunden.",
          "Kurznachrichten: nur vorgegebene Emotes, kein freier Chat; in den Einstellungen ausblendbar.",
          "Melden (⚑): Gegner lassen sich wegen Betrug, Beleidigung oder Verzögern melden; die Moderation prüft die Meldung und kann Profile sperren.",
        ],
      },
    ],
  },
};

const en: Record<RulesTopic, RulesChapter> = {
  general: {
    label: "Basics",
    intro:
      "All variants are played on the same board with 24 points and 15 checkers per player. The goal is to bring all your checkers into your home board and bear them off.",
    sections: [
      {
        title: "Board and direction",
        bullets: [
          "Points are numbered from each player's view from 24 (start) to 1; the home board is points 6 to 1.",
          "In the app your starting point is always top right and your home board bottom right – the board is turned for black.",
          "A checker moves forward by the number on a die. Each die is a separate move; both may be used by the same checker.",
          "Doubles are played four times.",
        ],
      },
      {
        title: "Who starts?",
        bullets: [
          "Each player rolls one die; the higher number starts. Ties are re-rolled.",
          "Backgammon: the starter plays the two opening dice as the first move.",
          "Portes, Plakoto, Fevga: the starter rolls again.",
          "In a tavli match the winner of the previous game starts the next one.",
        ],
      },
      {
        title: "Compulsory moves",
        bullets: [
          "As many dice as possible must be played; if only one order allows both, it must be chosen.",
          "If only one of two different dice can be played, the higher one must be played if possible.",
          "A move that ends the game at once (last checker borne off, mana in Plakoto) counts as complete.",
          "If no move is possible, the roll is forfeited (“no play”).",
        ],
      },
      {
        title: "Bearing off",
        bullets: [
          "Bearing off is allowed once all your checkers are in your home board (none on the bar or outside).",
          "A checker is borne off with the exact number (e.g. a 4 from point 4).",
          "A higher number may only be used when no own checkers remain on higher points.",
        ],
      },
      {
        title: "Scoring",
        bullets: [
          "A normal win scores 1 point.",
          "If the loser has not borne off any checker it is a gammon (backgammon) or mars (tavli): 2 points.",
          "Only backgammon has the triple backgammon win (see Backgammon).",
          "You may resign at any time, choosing single, gammon/mars or backgammon.",
        ],
      },
    ],
  },
  backgammon: {
    label: "Backgammon",
    intro: "The internationally known variant – with hitting and the doubling cube.",
    sections: [
      { title: "Setup", bullets: ["Per player: 2 checkers on 24, 5 on 13, 3 on 8 and 5 on 6."] },
      {
        title: "Hitting and the bar",
        bullets: [
          "A single checker on a point is a blot. An opposing checker landing on it hits it and sends it to the bar.",
          "A point with two or more opposing checkers is blocked.",
          "Checkers on the bar must re-enter first, in the opponent's home board on point 25 minus the die. Only then may other checkers move.",
          "If all six entry points are blocked (closed out), the turn is skipped without rolling.",
        ],
      },
      {
        title: "Doubling cube",
        bullets: [
          "Before rolling you may double while the cube is centred or yours.",
          "The opponent takes (the cube value doubles and the cube becomes theirs) or passes and loses the current value.",
          "The result of a game is multiplied by the cube value.",
          "No doubling in 1-point matches and in the Crawford game.",
        ],
      },
      {
        title: "Scoring",
        bullets: [
          "Single: 1 × cube.",
          "Gammon: the loser has not borne off – 2 × cube.",
          "Backgammon: additionally the loser still has a checker on the bar or in the winner's home board – 3 × cube.",
          "Jacoby rule (unlimited sessions only): gammons and backgammons count only after a double.",
        ],
      },
      {
        title: "Match and Crawford rule",
        bullets: [
          "A match is played to a fixed number of points (1, 3, 5, 7) or unlimited.",
          "When a player first reaches match length minus 1, the next game (Crawford game) is played without doubling; afterwards doubling is allowed again.",
        ],
      },
    ],
  },
  portes: {
    label: "Portes",
    intro: "The Greek sister of backgammon – same setup and hitting, but no doubling cube.",
    sections: [
      {
        title: "Rules",
        bullets: [
          "Setup, direction, hitting, bar and entering as in backgammon.",
          "No doubling cube.",
          "The winner of the opening roll rolls again instead of playing the opening dice.",
        ],
      },
      {
        title: "Scoring",
        bullets: [
          "Win: 1 point. Mars (the loser has not borne off): 2 points.",
          "There is no triple backgammon win.",
        ],
      },
    ],
  },
  plakoto: {
    label: "Plakoto",
    intro: "Instead of hitting, opposing checkers are pinned (“plakono” = I press down).",
    sections: [
      {
        title: "Setup and direction",
        bullets: [
          "All 15 checkers start on the own starting point 24 (the opponent's point 1).",
          "Players move in opposite directions as in backgammon.",
        ],
      },
      {
        title: "Pinning",
        bullets: [
          "Landing on a single opposing checker pins it; it stays and cannot move.",
          "The pinned checker is released once all pinning checkers have left the point.",
          "A point where the opponent is on top is blocked for the pinned player; the pinner may add more checkers.",
          "Points with two or more opposing checkers are blocked. There is no bar.",
          "While an own checker is pinned outside the home board, bearing off is impossible.",
        ],
      },
      {
        title: "Mana",
        bullets: [
          "Pinning the opponent's last checker on its starting point (the “mother”) wins at once with 2 points.",
        ],
      },
      {
        title: "Scoring",
        bullets: ["Win: 1 point. Mars (none borne off) or mana: 2 points. No doubling cube."],
      },
    ],
  },
  fevga: {
    label: "Fevga",
    intro: "Both players run in the same direction – no hitting, no pinning, only blocking.",
    sections: [
      {
        title: "Setup and direction",
        bullets: [
          "All 15 checkers start on the own starting point; the starting points are diagonally opposite.",
          "Both players move counter-clockwise around the whole board.",
        ],
      },
      {
        title: "Blocking",
        bullets: [
          "A single checker holds a point: you may not move onto points occupied by the opponent.",
          "There is no hitting, no pinning and no bar.",
        ],
      },
      {
        title: "Starting rule",
        bullets: [
          "Before a second checker may leave the starting point, the first checker must have passed the opponent's starting point.",
          "Interpretation in this app: if that first checker is blocked, other checkers may move.",
        ],
      },
      {
        title: "No six-point prime",
        bullets: [
          "A wall of six consecutive points is forbidden unless an opposing checker is already ahead of it.",
          "Interpretation in this app: the rule is checked after every single move, not only at the end of the roll.",
        ],
      },
      { title: "Scoring", bullets: ["Win: 1 point. Mars (none borne off): 2 points. No doubling cube."] },
    ],
  },
  tavli: {
    label: "Tavli match",
    intro: "The way it is played in Greece: the three variants in turn.",
    sections: [
      {
        title: "Sequence",
        bullets: [
          "Games rotate in a fixed order: Portes → Plakoto → Fevga → Portes …",
          "The match is played to a fixed number of points, usually 5 or 7.",
          "From the second game on, the winner of the previous game starts (no opening roll).",
          "Points are scored by the rules of the respective variant.",
        ],
      },
    ],
  },
  app: {
    label: "App & notation",
    intro: "How the app applies the rules and how to read the game history.",
    sections: [
      {
        title: "Notation",
        bullets: [
          "“64: 24/18 13/9” – roll 6-4, one checker from 24 to 18 and one from 13 to 9 (points from the mover's view).",
          "“*” marks a hit or pinned checker, “(2)” a repeated move, “bar” the bar, “off” bearing off.",
          "Moves of the same checker are joined: “24/13” instead of “24/18 18/13”.",
        ],
      },
      {
        title: "Controls",
        bullets: [
          "Tap a checker, then a highlighted destination – or drag it. Destinations using both dice are offered directly.",
          "Within your roll you can undo moves until you end the turn.",
          "Automatic rolling and ending the turn are configurable, each with a cancellable 3-second countdown.",
        ],
      },
      {
        title: "Resigning",
        bullets: [
          "Against the computer and online you offer to resign when it is your turn: single, gammon/mars or backgammon. The opponent accepts (the game ends with that result) or rejects (play goes on). Online one offer per turn is allowed, with 30 seconds to answer.",
          "Resigning at once without consent concedes the highest result still possible – no gammon once you have borne off a checker.",
          "The computer accepts an offer when it is worth at least what it expects from playing on – in a match measured by the chance to win the match.",
          "On a shared device the resigning player chooses the result directly.",
        ],
      },
      {
        title: "Positions (XGID)",
        bullets: [
          "Backgammon and Portes positions can be copied as XGID (side panel) and imported when starting a new game – compatible with eXtreme Gammon, GNU Backgammon and most analysis programs.",
        ],
      },
      {
        title: "Online",
        bullets: [
          "The server rolls the dice and checks every move – tampering in the browser has no effect.",
          "Provably fair dice: at match start the server commits to a secret seed by its hash, both browsers add their own random seeds, and every roll is derived via HMAC-SHA256. At the end the server reveals everything and the app recomputes each roll (“Dice verified”).",
          "Time per turn: 60 seconds (answering a double: 30 seconds). When it runs out the computer moves for you; three timeouts lose the match.",
          "After a disconnect you have 90 seconds to come back.",
          "FIBS ratings per variant; new players gain and lose points faster at first.",
          "Fair play: two profiles from the same device or network are never paired by matchmaking; private games between them are unrated. At most 3 rated matches per 24 hours count against the same opponent.",
          "Quick messages: predefined emotes only, no free chat; they can be hidden in the settings.",
          "Report (⚑): opponents can be reported for cheating, abuse or stalling; moderators review reports and can ban profiles.",
        ],
      },
    ],
  },
};

export const RULES: Record<Lang, Record<RulesTopic, RulesChapter>> = { de, en };
