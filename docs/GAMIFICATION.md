# Gamification: Erfolge, Vitrine und Freischaltbares

Alles hier ist **kosmetisch**: Es verändert weder Regeln noch Wertung, und das Basisspiel bleibt
vollständig frei. Fortschritt entsteht auf dem Gerät (lokale Spiele, Rätsel, Tutorial) und wird mit
einem Online-Profil geräteübergreifend zusammengeführt. Was online passiert, zählt der Server selbst
(siehe „Vom Server gezählt“); was nur auf dem Gerät passiert (Spiele gegen den Computer, Rätsel,
Tutorial), kann er nicht prüfen – wer seinen Browser-Speicher manipuliert, betrügt sich dort nur um
Kosmetik.

Einstieg in der App: **Profil → Vitrine** (auch über die Zeile „Wochenaufgaben“ auf der Startseite).

## Überblick

| Baustein          | Woraus berechnet                                                                | Belohnung                                                                                        |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Erfolge (35)      | lokales Spielarchiv, Karriere-Zähler, Rätsel, Tutorial, Online-Profil, Turniere | Bretter, Würfel, Steine, Rahmen, Extras                                                          |
| Steinsätze        | Siege je Variante (Karriere) oder Spielmarken                                   | 5 Steindesigns                                                                                   |
| Clubrang          | Aktivitätspunkte (Karriere + Rätsel + Lektionen)                                | Abzeichen neben dem Namen (online sichtbar)                                                      |
| Varianten-Meister | Siege je Variante (Karriere)                                                    | Plaketten Bronze/Silber/Gold, Intarsien-Brett                                                    |
| Wochenaufgaben    | Spiele und Rätsel der laufenden Woche                                           | Spielmarken                                                                                      |
| Eintauschen       | Spielmarken                                                                     | Steine, Würfel, Bretter (keine Prestige-Looks)                                                   |
| Besondere Momente | einzelne Partien im Archiv                                                      | Erfolge                                                                                          |
| Online-Rahmen     | Fernpartien, Herausforderungen, Ligen                                           | Rahmen Brief, Handschlag, Wappen; Messing-Würfel                                                 |
| Saisons           | Partien in der laufenden Jahreszeit                                             | Bretter Frühling, Ägäis-Sommer, Herbst, Winter (bleiben)                                         |
| Raritäten         | Ziele über Monate/Jahre; Luxus-Looks im Tausch                                  | Ebenholz-Brett, Lapis-Steine, Jade/Obsidian, Rahmen Rosette/Ehrennadel; Salon, Bernstein, Silber |

## Was zählt

- **Partien** = Spiele gegen den Computer oder online (alles im lokalen Archiv mit genau einem
  menschlichen Spieler). Spiele zu zweit an einem Gerät zählen nicht, weil sich der Sieg niemandem
  zuordnen lässt.
- **Siege je Variante** zählen die einzelnen Spiele; ein Tavli-Match zählt also als Portes, Plakoto
  bzw. Fevga.
- **Fernpartien** zählen, sobald der Server sie als beendet listet (abgebrochene Einladungen nicht).

## Karriere-Zähler (`apps/web/src/career.ts`)

Das lokale Archiv hält nur die letzten 200 Spiele. Für langfristige Ziele (100 Siege für Gold) führt
der Client deshalb Zähler, die nie kleiner werden:

| Feld                          | Bedeutung                                               |
| ----------------------------- | ------------------------------------------------------- |
| `games`, `wins`               | Partien und Siege insgesamt                             |
| `winsBy`                      | Siege je Variante (`CAREER_VARIANTS`)                   |
| `corrFinished`, `leagueGames` | beendete Fernpartien, davon Ligapartien                 |
| `expertWins`                  | Siege gegen den Experten (optional, später ergänzt)     |
| `challenged`                  | IDs herausgeforderter/eingeladener Freunde (max. 50)    |
| `weeks`                       | ISO-Woche → erledigte Aufgaben (Indizes 0–2)            |
| `owned`                       | eingetauschte Looks (Shop-IDs)                          |
| `seen`                        | Datum des zuletzt gezählten Archiv-Eintrags (nur lokal) |

Neue Archiv-Einträge werden genau einmal gezählt (alles nach `seen`). Bei der ersten Nutzung wird
das vorhandene Archiv übernommen.

**Synchronisation:** `Progress.career` (Protokoll `CareerSchema`). Zusammenführen mit
`mergeCareer`: Zähler nehmen den höheren Wert, Listen werden vereinigt, Wochen bleiben etwa drei Jahre
erhalten. Spielmarken werden nicht gespeichert, sondern immer berechnet (verdient minus Preise der
eingetauschten Looks) – so kann es durch zwei Geräte keine doppelt ausgegebenen Marken geben.

## Clubrang

Punkte (`clubPoints` im Protokoll, Server und Client rechnen identisch):

| Quelle                   | Punkte         |
| ------------------------ | -------------- |
| Partie                   | 1              |
| Sieg                     | 1 (zusätzlich) |
| gelöstes Tagesrätsel     | 1              |
| gelöste Tutorial-Lektion | 1              |
| beendete Fernpartie      | 2              |
| erledigte Wochenaufgabe  | 3              |

| Rang          | ab Punkten | Abzeichen |
| ------------- | ---------- | --------- |
| Gast          | 0          | –         |
| Stammgast     | 30         | I         |
| Mitglied      | 120        | II        |
| Vorstand      | 350        | III       |
| Ehrenmitglied | 900        | ★         |

Der Server speichert den Rang beim Zusammenführen des Fortschritts in `players.club_rank` und liefert
ihn als `rank` in `PublicPlayer`, `FriendView` und `LeaderboardEntry`. `PlayerName` zeigt ihn als
kleines Messing-Abzeichen; das Löschen des Profils setzt ihn zurück.

## Varianten-Meister

Pro Variante (Backgammon, Portes, Plakoto, Fevga, Tavla, Narde, Hypergammon) eine Plakette:
**Bronze ab 5, Silber ab 25, Gold ab 100 Siegen**. IDs `master-<variante>-<1|2|3>`; alle sieben in
Gold ergeben `master-all` und schalten das Brett **Intarsien** frei. Plaketten stehen nicht in der
Erfolgsliste (sonst 21 Einträge), sondern in der Vitrine; beim Erreichen erscheint trotzdem der
Hinweis oben.

## Wochenaufgaben und Spielmarken

- Woche = ISO-Woche in Ortszeit, Montag 0 Uhr bis Montag 0 Uhr (`weekId`, `weekRange`).
- Jede Woche drei verschiedene Aufgaben, deterministisch aus der Wochen-ID gewürfelt (`tasksFor`) –
  alle Geräte und Spieler bekommen dieselben.
- Aufgabenvorrat (`TaskKind`):

| Art           | Ziel                                             |
| ------------- | ------------------------------------------------ |
| `win-variant` | 1 Sieg in einer zufälligen Variante              |
| `win`         | 3 Siege                                          |
| `play`        | 5 Partien                                        |
| `puzzles`     | 3 Tagesrätsel gelöst                             |
| `beat-strong` | 1 Sieg gegen den Computer auf Stark oder Experte |
| `gammon`      | 1 doppelter Sieg (Gammon/Mars)                   |
| `online`      | 2 Online-Partien                                 |

- Fortschritt wird aus Archiv und Rätseln der Woche berechnet; erledigte Aufgaben werden in
  `career.weeks` festgehalten und bleiben erledigt.
- **Spielmarken:** 1 je Aufgabe, 2 extra, wenn alle drei einer Woche erledigt sind (max. 5 pro Woche).

### Eintauschen (`SHOP`)

| Look                                                                        | Preis |
| --------------------------------------------------------------------------- | ----- |
| Steinsätze Perlmutt, Olivenholz, Onyx & Alabaster, Messing, Bein & Ebenholz | 6     |
| Würfel Gold, Rubin                                                          | 4     |
| Bretter Nacht, Marmor, Turnier, Olive                                       | 8     |
| **Rarität:** Würfel Silber                                                  | 12    |
| **Rarität:** Steinsatz Bernstein & Mokka                                    | 20    |
| **Rarität:** Brett Salon                                                    | 30    |

Prestige-Looks gibt es **nur** über Erfolge: Intarsien (alle Plaketten Gold), die Saison-Bretter,
Messing-Würfel (Liga), die Raritäten-Belohnungen und alle Rahmen. Was bereits per Erfolg frei ist,
wird nicht angeboten. Umgekehrt gibt es die drei Luxus-Looks (Silber, Bernstein, Salon) **nur** im
Tausch (`REWARDS` → `SHOP_ONLY`, `rare: true` im `SHOP`).

## Steinsätze

Einstellung `checkerSet` (Standard: passend zum Brett). Ein Satz ersetzt beide Steinfarben, damit
Hell und Dunkel klar unterscheidbar bleiben; er wirkt nur auf dem eigenen Gerät (der Gegner sieht
seine eigene Einstellung).

| Satz             | Erfolg      | Bedingung                       |
| ---------------- | ----------- | ------------------------------- |
| Perlmutt         | `set-pearl` | 10 Siege Backgammon             |
| Olivenholz       | `set-wood`  | 10 Siege Plakoto                |
| Onyx & Alabaster | `set-onyx`  | 10 Siege Fevga                  |
| Messing          | `set-brass` | 10 Siege Portes oder Tavla      |
| Bein & Ebenholz  | `set-bone`  | 10 Siege Narde oder Hypergammon |

## Besondere Momente

| Erfolg         | Bedingung                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `comeback`     | Match gewonnen, in dem man mit mindestens 4 Punkten zurücklag (Archiv-Feld `matchEnd.maxDeficit`) |
| `double-sixes` | in einem gewonnenen Spiel dreimal 6-6 gewürfelt                                                   |
| `mana`         | Plakoto gewonnen durch Einklemmen der „Mutter“                                                    |
| `cube-eight`   | Spiel gewonnen mit dem Verdopplungswürfel auf 8 oder höher                                        |

`matchEnd` wird beim letzten Spiel eines Matches ins Archiv geschrieben: Sieger und der größte
Rückstand je Seite über den Matchverlauf.

## Online-Rahmen und Liga

| Belohnung            | Erfolg          | Bedingung                                                     |
| -------------------- | --------------- | ------------------------------------------------------------- |
| Rahmen ✉️ Brief      | `corr-ten`      | 10 Fernpartien zu Ende gespielt                               |
| Rahmen 🤝 Handschlag | `friends-five`  | 5 verschiedene Freunde herausgefordert (live oder Fernpartie) |
| Rahmen 🛡️ Wappen     | `league-win`    | eine Club-Liga gewonnen                                       |
| Messing-Würfel       | `league-player` | eine Ligapartie zu Ende gespielt                              |

Die Rahmen-Zuordnung steht in `FRAMES` (Protokoll); der Server prüft sie beim Wählen. Der Rahmen
„Mäzen“ gehört zu den Unterstützern (`docs/SUPPORT.md`), nicht zu einem Erfolg.

## Vom Server gezählt

Was online passiert, zählt der Server aus seinen eigenen Daten (`Store.verifiedCareer`,
`Store.verifiedAchievements` in `apps/server/src/db.ts`):

| Was                                    | Quelle                                      |
| -------------------------------------- | ------------------------------------------- |
| Partien und Siege (je Variante) online | `matches.games` (jedes Spiel eines Matches) |
| Partien und Siege in Fernpartien       | `corr_games.games` (beendete Partien)       |
| beendete Fernpartien, Ligapartien      | `corr_games`, `league_matches`              |
| Erfolge `online-win`, `rating-1600`    | Matches, Ratings                            |
| `tournament-win`, `league-win`         | Turniere, Ligen                             |
| `corr-ten`, `league-player`            | Fernpartien, Ligapartien                    |

Beim Zusammenführen des Fortschritts sind diese Zahlen die **Untergrenze**: Ein Gerät, das weniger
weiß (etwa ein neues Handy), kann sie nicht senken; Spiele gegen den Computer kommen vom Gerät dazu
(höherer Wert gewinnt). Die Online-Erfolge trägt der Server selbst ein. Die Rahmen dieser Erfolge
(Gold, Lorbeer, Brief, Wappen) lassen sich nur wählen, wenn der Server sie in seinen Daten findet –
ein nur behaupteter Erfolg genügt nicht. Rahmen für Offline-Ziele (Tutorial, Rätsel, Raritäten)
prüft er weiterhin nur gegen den gespeicherten Fortschritt.

## Saisons

- Jede Jahreszeit ist eine Saison: **Frühling** (März–Mai), **Sommer** (Juni–August), **Herbst**
  (September–November), **Winter** (Dezember–Februar, benannt nach dem Jahr des Dezembers:
  `season-winter-2026` = Dez. 2026 bis Feb. 2027). IDs: `season-<art>-<jahr>`.
- 10 Partien (gegen den Computer oder online) innerhalb der Saison schalten ihr Brett dauerhaft frei:
  Frühling, Ägäis-Sommer, Herbst, Winter. Eine Saison der Art genügt; verpasst man sie, kommt sie im
  nächsten Jahr wieder.
- Code: `SEASONS`, `seasonOf`, `seasonIds`, `hasSeason` in `career.ts`; Bretter in
  `board/themes.tsx`; `REWARDS.style` verweist auf `season-<art>`, `hasLook` prüft jede Saison der
  Art. Eine neue Saison-Art (etwa ein Event) braucht dort einen Eintrag, ein Brett und Texte
  (`seasonNames`).

## Raritäten

Ziele für Monate und Jahre, damit auch Vielspieler noch etwas vor sich haben. Ihre Belohnungen sind
nicht eintauschbar; wer sie trägt, hat sie sich erspielt. In der Vitrine haben sie einen eigenen
Abschnitt mit Fortschritt, in der Erfolgsliste ein Messing-Etikett „Rarität“ (`rare: true`).

| Erfolg         | Bedingung                                         | Belohnung                     | grob erreichbar nach¹ |
| -------------- | ------------------------------------------------- | ----------------------------- | --------------------- |
| `puzzles-100`  | 100 Tagesrätsel gelöst                            | Würfel Jade                   | gut 3 Monaten         |
| `expert-25`    | 25 Siege gegen den Experten (`career.expertWins`) | Würfel Obsidian               | je nach Spielstärke   |
| `perfect-12`   | in 12 Wochen alle drei Wochenaufgaben erledigt    | Brett Ebenholz & Gold         | 3 Monaten             |
| `wins-500`     | 500 Siege (Karriere)                              | Steinsatz Lapis & Gold        | 1–2 Jahren            |
| `honor-member` | höchster Clubrang (900 Punkte)                    | Rahmen 🎖️ Ehrennadel (online) | ca. 1 Jahr            |
| `games-1000`   | 1000 Partien (Karriere)                           | Rahmen 🏵️ Rosette (online)    | 2+ Jahren             |

¹ bei einigen Partien pro Woche. Für `expert-25` und `wins-500` zählt der höhere Wert aus Karriere
und Archiv, damit ältere Expertensiege aus der Zeit vor dem Zähler nicht verloren gehen.

Die Luxus-Looks im Tausch kosten 12, 20 und 30 Marken; bei höchstens 5 Marken pro Woche sind das
mindestens 3, 4 und 6 perfekte Wochen. Die Rahmen der Raritäten haben einen doppelten Messingring.

## Vitrine (`screens/ShowcaseScreen.tsx`)

Eine Seite mit allem Gesammelten und Fehlenden: Clubrang mit Fortschritt, Wochenaufgaben,
Eintauschen, Varianten-Meister, Saison, Rahmen, Raritäten, die Auswahl von Brett/Würfeln/Steinen und die
vollständige Erfolgsliste. Gesperrtes zeigt immer, wie man es bekommt (`lockText`).

## Erweitern

- **Neuer Erfolg:** Eintrag in `ACHIEVEMENTS` (`achievements.ts`) mit `progress`, ggf. Belohnung in
  `REWARDS` (`rewards.tsx`). Ids: `[a-z0-9-]{1,40}`; der Fortschritt fasst bis zu 300 Freischaltungen.
- **Neuer Look zum Eintauschen:** Eintrag in `SHOP` (`career.ts`); die Shop-ID folgt dem Muster
  `style-…`, `dice-…`, `set-…`, damit `hasLook` sie findet. Nur im Tausch: `rare: true` und in
  `REWARDS` den Wert `SHOP_ONLY` eintragen.
- **Neuer Rahmen:** `FRAMES` im Protokoll (Server prüft automatisch), Aussehen in `FRAME_LOOK`, Name in
  `frameNames` (i18n).
- Tests: `apps/web/src/career.test.ts`, `apps/web/src/achievements.test.ts`,
  `apps/server/test/security.test.ts` („merges careers …“).
