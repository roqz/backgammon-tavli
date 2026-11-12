# Review November 2026: Vollständigkeit, Sicherheit, UI/UX, Wettbewerb, Plan

Stand: Branch `rewrite/foundation`, Commit `778557c`. Unit-Tests grün (Engine 67, KI 21, Web 21, Server 46), E2E 10/10.
Die mit ✔ markierten Befunde wurden zusätzlich direkt im Code nachgeprüft.

## 1. Kurzfazit

Spiel-Engine, Bots, Online-Spiel, Turniere und Moderation sind funktional weit. Für einen **öffentlichen Start** fehlen vor allem
Dinge außerhalb des Spielkerns:

1. **Recht/Datenschutz:** Impressum, Datenschutzerklärung, Konto löschen, Datenexport, Aufbewahrungsfristen
2. **Härtung:** Server-Blockade durch synchrones Passwort-Hashing, unbegrenzte Sitzungen, fehlende Security-Header, Limits für Verbindungen und Turniere
3. **Betrieb:** Backups, Fehlerbehandlung, Logging
4. **Mobile Bedienung:** Zurück-Taste des Geräts verlässt die App, Querformat auf dem Handy, Tastatur und Screenreader

Ein Regelfehler muss sofort behoben werden: die Aufgabe im reinen Rennen (2.1).

---

## 2. Vollständigkeit

### 2.1 Fehler und Lücken gegenüber dem Konzept

| #    | Befund                                                                                                                                                                                                                                                                                                         | Ort                                                             | Schwere |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| V1 ✔ | **Sofortige Aufgabe gibt zu viel ab.** `maxResultLevel` liefert ein Backgammon, sobald der Verlierer noch nichts abgetragen hat. Ob noch Kontakt besteht, wird nicht geprüft. Im reinen Rennen ist aber höchstens noch ein Gammon möglich. Online wird die Aufgabe auf diesen Wert angehoben.                  | `packages/engine/src/game.ts:95`, `apps/server/src/room.ts:221` | hoch    |
| V2   | Die Engine prüft die Aufgabe-Stufe nicht. Stufe 3 wird auch in Portes, Plakoto und Fevga sowie mit Jacoby angenommen. `offer-resign` wird auf dem Server nicht begrenzt; nur die Oberfläche schränkt ein.                                                                                                      | `game.ts:288-305`, `room.ts:231`                                | mittel  |
| V3   | Barrierefreiheit (Konzept „Darstellung“) fehlt weitgehend: Das Brett ist eine einzige Grafik ohne Tastaturbedienung, das Label „Spielbrett“ ist fest auf Deutsch.                                                                                                                                              | `apps/web/src/board/Board.tsx:213`                              | mittel  |
| V4   | Die README ist veraltet: Dort steht „online play planned“, `packages/protocol` und `apps/server` fehlen, und es heißt, es gebe nur Gäste.                                                                                                                                                                      | `README.md`                                                     | niedrig |
| V5   | Das Konzept widerspricht sich: „Offen“-Listen in Phase 2 und 3 nennen Erledigtes, und die Phasennummern von Online und Experten-KI vertauschen sich. Abweichungen vom Architekturplan sind nicht dokumentiert: SQLite statt Postgres, kein Better Auth/OAuth, kein Router, Archiv in localStorage statt Dexie. | `docs/KONZEPT.md`                                               | niedrig |

### 2.2 Spielregeln

- **Backgammon:**
  - Crawford und Jacoby sind korrekt und getestet.
  - Beaver, Raccoon und automatische Doppel fehlen; sie sind im Geldspiel üblich und optional.
  - Online gibt es nur Matches auf 1, 3, 5 oder 7 Punkte, also **kein Geldspiel**.
- **Portes:** korrekt, höchstens 2 Punkte, getestet.
- **Plakoto:**
  - Ausgangsstellung, Festsetzen und Mana sind korrekt.
  - Mana-Ausnahmen fehlen, etwa wenn die eigene Mutter auch festgesetzt ist (im Konzept als offen geführt).
  - Ungetestet: festgesetzte Steine blockieren das Abtragen; Mana, während der Festsetzende selbst festgesetzt ist.
- **Fevga:**
  - Die Prüfung, ob sechs Punkte blockiert sind, läuft pro Einzelzug statt am Ende des Zugs und kann damit zu streng sein.
  - Hängt der Läufer fest, dürfen andere Steine ziehen; das ist eine Hausregel als Ausweichlösung.
  - Beides ist im Konzept als offen geführt; die Ausnahmefälle sind ungetestet.
- **Ohne Tests:** `rng.ts`, die Grenzen der Aufgabe-Stufen und die Notation der griechischen Varianten.

### 2.3 Betriebsreife

- **Backups:** keine. Die Datenbank läuft im WAL-Modus, eine einfache Dateikopie ist daher unsicher. Nötig ist `VACUUM INTO` per Cronjob mit Rotation.
- **Migrationen:** Spalten werden ad hoc nachgerüstet („ADD COLUMN, falls sie fehlt“). Es gibt kein `user_version` und keine Datenmigrationen.
- **Logging und Monitoring:**
  - Nur `console.log`; keine Metriken, keine Fehlererfassung, keine Log-Rotation in Docker.
  - `/api/health` prüft die Datenbank nicht.
- **Fehlerbehandlung:**
  - Ein Fehler in einem Timer beendet den Prozess und bricht alle laufenden Matches ab; es gibt keinen `uncaughtException`-Handler.
  - Beim Herunterfahren gehen normale Matches stillschweigend verloren, ohne Hinweis an die Spieler.
- **Skalierung:**
  - Nur eine Instanz: alle Laufzeitdaten liegen im Speicher.
  - Bis zu einigen hundert gleichzeitigen Spielern reicht das; dann müssten Lobby und Räume aufgeteilt werden.
- **CI:**
  - Ein Docker-Build fehlt, ebenso Dependency-Audit, Dependabot und CodeQL.
  - `pages.yml` veröffentlicht, ohne auf die CI zu warten.
  - Für `packages/protocol` gibt es keine Tests.

---

## 3. Sicherheit

**Kein kritischer Befund.**

- Alle SQL-Abfragen nutzen Parameter.
- Alle WebSocket- und REST-Eingaben werden mit zod und engen Grenzen geprüft.
- Der Sitzplatz eines Spielers ergibt sich auf dem Server aus der Sitzung.
- Würfel kommen nie vom Client und sind per Commit-Reveal überprüfbar.
- Es gibt kein `innerHTML`.
- Tokens werden gehasht und in konstanter Zeit verglichen.
- Push-Endpunkte sind auf die bekannten Dienste beschränkt.
- Der Server-Container läuft nicht als root.

| #    | Befund                                                                                                                                                                                                           | Ort                                          | Schwere  | Maßnahme                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| S1 ✔ | `scryptSync` blockiert den Event-Loop (30–80 ms pro Aufruf). Passwortänderungen sind nicht limitiert. Etwa 20 Anfragen pro Sekunde legen alle Partien lahm, die Spieler verlieren dann durch Zeitüberschreitung. | `apps/server/src/db.ts:165`, `server.ts:208` | **hoch** | asynchrones `crypto.scrypt`; Limit pro Spieler und IP; Login-Drossel pro Konto; danach N=2^17                      |
| S2   | Rate-Limiter: Die Tabelle wächst ohne Grenze, IPv6-Nutzer umgehen das Limit durch Adresswechsel, und es wird der erste `X-Forwarded-For`-Eintrag übernommen.                                                     | `server.ts:91`, `server.ts:165`              | mittel   | Einträge aufräumen, IPv6 nach /64 zusammenfassen, letzten nicht vertrauten Hop verwenden                           |
| S3   | Turnier-Spam: Gäste sind kostenlos, `GET /api/tournaments` liefert alle offenen Turniere ungepaginiert mit vielen Abfragen je Turnier.                                                                           | `tournaments.ts`, `server.ts:268`            | mittel   | Turniere nur für Konten oder ab n Matches; globale Obergrenze; Paginierung                                         |
| S4   | Zugangsdaten verfallen nie: Das Gast-Token bleibt nach dem Kontoanlegen gültig, Sitzungen haben kein Ablaufdatum, und eine Passwortänderung meldet nichts ab.                                                    | `db.ts:314-327`                              | mittel   | Token rotieren und Sitzungen beenden beim Passwortwechsel; Ablauf nach Inaktivität und absolut; „überall abmelden“ |
| S5   | Keine Security-Header: CSP, HSTS, frame-ancestors, nosniff und Referrer-Policy fehlen. Bei einer künftigen XSS-Lücke wäre das Token im localStorage sofort abgreifbar.                                           | `deploy/Caddyfile`                           | mittel   | Header-Block in Caddy                                                                                              |
| S6   | Beliebig viele WebSocket-Verbindungen; Sockets ohne `hello` bleiben offen.                                                                                                                                       | `server.ts:332`                              | mittel   | Limit pro IP, Timeout ohne Anmeldung nach 10 s, Origin-Prüfung                                                     |
| S7   | Namen erlauben Steuerzeichen, Bidi-Umkehrung und Doppelgänger wie „Admin“; Umbenennen ist unbegrenzt.                                                                                                            | `protocol` `NameSchema`                      | niedrig  | `\p{Cc}\p{Cf}` entfernen, reservierte Namen sperren, Umbenennen begrenzen                                          |
| S8   | Eine Push-Subscription lässt sich per Endpunkt-URL auf ein anderes Konto umhängen.                                                                                                                               | `push.ts` `subscribe`                        | niedrig  | nur überschreiben, wenn der Spieler gleich ist                                                                     |
| S9   | Ein zweites `hello` auf derselben Verbindung hinterlässt einen veralteten Eintrag.                                                                                                                               | `lobby.ts:240`                               | niedrig  | ablehnen                                                                                                           |
| S10  | Turniere lassen sich mit Zweitkonten füllen, die nicht erscheinen; die Mitspieler bekommen so kampflose Siege.                                                                                                   | Design                                       | niedrig  | Turniere nur für Konten (S3)                                                                                       |
| S11  | Lieferkette: GitHub-Actions und Basis-Images sind nur per Tag, nicht per SHA bzw. Digest festgelegt; der Caddy-Container läuft als root; CORS steht standardmäßig auf `*`.                                       | `.github`, `deploy`                          | niedrig  | festlegen, CORS in Produktion explizit setzen                                                                      |
| S12  | Einladungscodes lassen sich raten (etwa 10⁹ Möglichkeiten, 30 Minuten gültig); fehlgeschlagene Beitritte sind nicht limitiert.                                                                                   | `lobby.ts`                                   | niedrig  | Limit für Fehlversuche pro IP                                                                                      |

---

## 4. UI/UX

**Stärken:**

- Das Brett ist klar und poliert.
- Ziehen geht per Tippen und per Ziehen; Rückgängig, Zug beenden sowie automatisches Würfeln und Bestätigen sind sauber gelöst.
- Ereignisbanner, eine sorgfältige Aufgabe-Logik und überprüfbare Würfel.
- Das Rückweg-Konzept im Turnier ist gut.
- Deutsch und Englisch haben typgleiche Wörterbücher, das Designsystem ist einheitlich.

### Hoch

1. **Die Zurück-Taste des Geräts verlässt die App.** Unter Android und als installierte PWA kann das ein laufendes Online-Match beenden. Die App legt keine History-Einträge an (`App.tsx`). → Bildschirme, Drawer und Dialoge per `pushState`/`popstate` abbilden.
2. **Das Brett ist ohne Maus nicht bedienbar.** Weder Tastatur noch Screenreader funktionieren. → Punkte fokussierbar machen, Pfeiltasten/Enter, eine Textbeschreibung der Stellung.
3. **Dialoge verwalten den Fokus nicht.** Es gibt keine Fokusfalle, Escape greift nur, wenn der Fokus schon im Dialog ist, und `aria-labelledby` fehlt. → natives `<dialog>` verwenden.
4. **Handy im Querformat:** Das Brett ist etwa 560 px hoch bei 390 px Bildschirmhöhe, man muss scrollen. → Brett nach der Höhe skalieren, Bedienelemente seitlich anordnen.
5. **Hochformat:** Punktestand, Pips und Gegner liegen unter dem Brett, außer Sicht. → kompakte Leiste über dem Brett.

### Mittel

6. ✔ **Doppelte deutsche Begriffe:**
   - „Aufgeben“ steht sowohl für das Ablehnen eines Doppels als auch für die Aufgabe der Partie.
   - „Zurück“ bedeutet sowohl Rückgängig als auch Zurück.
     → „Ablehnen (Passen)“ und „Rückgängig“.
7. ✔ Die Ziffern der Zug-Tipps stehen im Hochformat quer (`Board.tsx:675` übergibt `false` statt `rotated`).
8. **Sprache:**
   - `<html lang>` bleibt immer „de“.
   - Einige `aria-label`s sind fest verdrahtet.
   - Datumsangaben richten sich nach der Browsersprache statt nach der App-Sprache.
9. **Rohe Fehlermeldungen** wie „unknown player“ oder „replaced“ erscheinen unübersetzt und verschwinden nach 4 Sekunden.
10. **Eigene Verbindung:** Bricht sie im Spiel ab, sieht man keinen Hinweis, während die eigene Uhr weiterläuft.
11. **„Du bist dran“:** Kein Hinweis per Ton, Tab-Titel oder Vibration, wenn man in einem anderen Tab ist.
12. **Einladungslink ohne Profil:** Man sieht nur das Formular „Profil erstellen“, ohne Hinweis auf die Einladung.
13. **Warteschlange:** Wer den Online-Bildschirm verlässt, bleibt unsichtbar in der Warteschlange und wird später plötzlich ins Spiel gerissen.
14. **Endstellung:** Die Dialoge am Spielende verdecken sie, sie lassen sich nicht schließen.
15. **Reduzierte Bewegung:** `animate-pulse` und die 3D-Würfel ignorieren diese Einstellung.
16. **Zielpunkte:** Auf hellen Feldern kontrastarm und nur über Farbe markiert.
17. **Turnierliste:** Weder Lade- noch Fehlerzustand; sie zeigt sofort „keine Turniere“.
18. **Wiederholung:** Ignoriert Spiegelung, Drehung und Punktnummern.

### Niedrig (Auswahl)

- Pfeil-Buttons ohne `aria-label`.
- Online-Reiter sind keine richtige `tablist`.
- „1 Punkte“.
- Emote-Auswahl schließt nicht bei Escape oder Klick daneben.
- Kopieren in die Zwischenablage ohne Fehlerbehandlung.
- Keine Kurzbeschreibung der Varianten bei der Auswahl.
- Regeln nur als Text, keine Diagramme.
- Leere Statistik ohne Button „Spielen“.
- `autoUpdate` der PWA kann mitten im Spiel neu laden; besser ein Hinweis „Update verfügbar“.

---

## 5. Wettbewerb

| Anbieter                                                 | Stärken                                                                                                                                                                     | Schwächen / unsere Chance                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Backgammon Galaxy** (Web/App)                          | großer Spielerpool, Analyse jedes Matches mit starker Engine, Lektionen von Großmeistern, Turniere, Live-Mitschrift für Turniere vor Ort, Premium mit Rollouts | nur Backgammon, kommerziell, Premium-Modell                                                                         |
| **GNU Backgammon** (Desktop, OSS)                        | neuronales Netz, Rollouts, Match-Import/Export (.mat, .sgf), sehr starke Analyse                                                                                            | kein Online-Spiel, altbackene Oberfläche                                                                            |
| **eXtreme Gammon / BGBlitz** (Desktop)                   | Referenz für Analyse, Positionsdatenbanken, Trainer                                                                                                                         | kostenpflichtig, kein Gelegenheitsspiel                                                                             |
| **Backgammon Studio Heroes**                             | Online-Spiel mit Rating, Turniere, Lernfunktionen                                                                                                                           | Nischencommunity                                                                                                    |
| **bgammon.org / Boxcars** (OSS, AGPL)                    | Open Source, Browser/Desktop/Android, Zuschauen, Match-Wiederholung, mehrere Varianten (Acey-Deucey, Tabula)                                                                | kein Tavli, schlichte Grafik, keine Analyse                                                                         |
| **iTavli, Tavli Master, 10 Tawla, Backgammon 18** (Apps) | Plakoto und Fevga, ELO, Freunde, teils Bluetooth, viele Varianten (Tavla, Narde, Mahbuse)                                                                                   | Werbung, kostenpflichtige Varianten, wiederkehrende Vorwürfe manipulierter Würfel in den Bewertungen, keine Analyse |

**Alleinstellung von Tavli:**

- Open Source und kostenlos, ohne Werbung.
- **Überprüfbar faire Würfel.** Das ist ein direktes Argument gegen die häufigste Beschwerde bei Tavli-Apps.
- Die drei griechischen Varianten mit Tavli-Match-Rotation, starker Bot für alle Varianten.
- Als PWA offline spielbar.

### Was gegenüber der Konkurrenz fehlt

1. **Matchanalyse für Spieler:**
   - Fehlerliste, Fehlerrate bzw. Performance Rating und „bester Zug“ pro Entscheidung.
   - Die Analyse läuft schon serverseitig für Fair Play, wird Spielern aber nicht gezeigt.
2. **Stärkere Engine:** neuronales Netz und Rollouts.
3. **Lernen:** tägliches Puzzle bzw. Positionstrainer, Lektionen, interaktives Tutorial für das erste Spiel.
4. **Sozial:**
   - Freunde, Chat (moderiert), Zuschauen bei laufenden Matches und Turnierfinals.
   - Clubs bzw. Ligen.
5. **Geldspiel online** und **Korrespondenzspiel** (ein Zug pro Tag, mit Push).
6. **Match-Export** im `.mat`-Format (gnubg/XG) und GNUbg-ID; bisher gibt es nur XGID.
7. **Profil:** Rating-Verlauf als Grafik, Erfolge, Statistik pro Variante.
8. **Weitere Varianten:** Tavla (türkisch), Narde/Long Nardy, Acey-Deucey.
9. **Präsenz in den App Stores:** Play Store per TWA; iOS nur über einen Wrapper.

---

## 6. Mögliche Erweiterungen

| Erweiterung                                                                | Nutzen                               | Aufwand               |
| -------------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| Matchanalyse-Ansicht (Fehlerrate, Fehlerliste, Sprung in die Wiederholung) | hoch, die Daten gibt es fast schon   | M                     |
| Interaktives Tutorial und Variantenkurzbeschreibungen                      | Einstieg für neue Spieler            | M                     |
| Tägliches Puzzle (Stellungen aus Bot-Selbstspiel mit klarem Fehler)        | Spieler kommen täglich wieder        | M                     |
| Zuschauen (nur lesend, mit Verzögerung gegen Mithilfe von außen)           | Turniere werden erlebbar             | M                     |
| Freundesliste und direkte Herausforderung (mit Push)                       | bindet Spieler                       | M                     |
| Chat (Schnellnachrichten gibt es; Freitext nur mit Melden und Filter)      | sozial                               | M, Moderationsaufwand |
| Korrespondenzspiel (asynchron, Push pro Zug)                               | passt gut zu PWA und Push            | L                     |
| Geldspiel online (Einsatz in Punkten, Jacoby/Beaver)                       | Backgammon-Puristen                  | S–M                   |
| `.mat`-Export/-Import, GNUbg-ID                                            | Analyse in gnubg/XG                  | S                     |
| Rating-Verlauf, Erfolge                                                    | Motivation                           | S                     |
| Neuronales Netz pro Variante (TD-Selbstspiel, Inferenz in WASM/ONNX)       | Spielstärke, Analysequalität         | L                     |
| Clubs/Ligen, Turnier-Zeitpläne, Turniere nur für Konten                    | Community                            | L                     |
| Tavla, Narde                                                               | neue Zielgruppen (Türkei, Osteuropa) | M je Variante         |
| Play Store per TWA                                                         | Reichweite                           | S                     |
| Unterstützerstatus, Brett- und Würfeldesigns als Cosmetics                 | Finanzierung ohne Pay-to-Win         | M                     |

S = bis 1 Tag, M = einige Tage, L = mehrere Wochen

---

## 7. Plan

### Phase A: Vor dem öffentlichen Start (Pflicht)

| Bereich    | Aufgaben                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Regeln     | V1 Aufgabe-Stufe anhand des Kontakts berechnen; V2 Stufen in der Engine pro Variante begrenzen, Server begrenzt auch `offer-resign`; Tests dafür                                                                                                                                           |
| Sicherheit | S1 asynchrones scrypt plus Limits; S4 Sitzungsablauf, Token-Rotation, überall abmelden; S5 Security-Header in Caddy; S6 WebSocket-Limits; S3 Turniere nur für Konten plus Obergrenze plus Paginierung; S2 Rate-Limiter reparieren; S7 Namensfilter                                         |
| Recht      | Impressum, Datenschutzerklärung (inkl. Fair-Play-Auswertung, Push, IP nur im Speicher), Konto löschen und Datenexport in API und UI, Aufbewahrung (Gäste ohne Spiele nach X Monaten löschen, Zugzeiten und Analysen nach 90 Tagen), Quellcode-Link in der App (AGPL §13)                   |
| Betrieb    | tägliches Backup per `VACUUM INTO` mit Rotation, Wiederherstellung dokumentiert; Fehlerhandler gegen Abstürze; Warnung an die Spieler vor dem Herunterfahren; Health-Check mit DB-Abfrage; Log-Rotation; Migrationen per `user_version`; Docker-Build in der CI; Pages erst nach grüner CI |
| UI/UX      | Zurück-Taste über die History; Querformat auf dem Handy; Leiste mit Stand und Pips im Hochformat; eindeutige Begriffe; Hinweis bei eigenem Verbindungsabbruch; übersetzte Fehlermeldungen; Ziffern-Fix; `lang`-Attribut                                                                    |
| Doku       | README aktualisieren, Konzept bereinigen                                                                                                                                                                                                                                                   |

### Phase B: Qualität nach dem Start

- **Barrierefreiheit:** Brett per Tastatur und Screenreader, Fokus in Dialogen, Kontrast der Zielpunkte, reduzierte Bewegung vollständig.
- **Hinweise:**
  - „Du bist dran“ per Ton, Titel und Vibration.
  - Kontext beim Einladungslink.
  - Anzeige der Warteschlange.
  - Endstellung ansehen.
  - Lade- und Fehlerzustände.
  - Update-Hinweis der PWA.
- **Tests:** protocol, rng, Regel-Ausnahmen, Wiederaufnahme von Turnieren, Schweizer System mit 16 Spielern, Passwortwechsel, Sperre.
- **CI:** Dependency-Audit, Dependabot, CodeQL.
- **Kalibrierung:** Schwellen der Fair-Play-Signale (Übereinstimmung, Zugzeiten) mit echten Daten nachjustieren.
- **Push:** in echten Browsern auf dem VPS mit HTTPS prüfen.

### Phase C: Features gegenüber der Konkurrenz

1. Matchanalyse-Ansicht für Spieler
2. Tutorial, Variantenbeschreibungen, Regeln mit Diagrammen
3. Freunde und direkte Herausforderung, Zuschauen
4. `.mat`-Export, GNUbg-ID, Rating-Verlauf
5. Geldspiel online
6. Tägliches Puzzle

### Phase D: Ausbau

- Neuronales Netz pro Variante, danach erneut prüfen, ob Züge nach Match-Gewinnchance gewichtet werden sollen
- Korrespondenzspiel
- Clubs/Ligen, Turnier-Zeitpläne
- Chat
- Tavla, Narde
- Play Store per TWA
- Unterstützerstatus und Cosmetics
- E-Mail-Bestätigung, Passwort-Reset, OAuth: sobald SMTP und Client-IDs vorhanden sind
- Regel-Feinheiten: Mana-Ausnahmen, Fevga-Prüfung am Zugende, sobald die Regeln geklärt sind

**Empfohlene Reihenfolge:**

1. Phase A: Regeln, Sicherheit und Betrieb lassen sich ohne dich umsetzen. Für Impressum und Datenschutzerklärung brauche ich deine Angaben: Betreiber, Anschrift, Kontakt.
2. Phase B
3. Matchanalyse aus Phase C, weil die Daten schon da sind und sie der größte Rückstand gegenüber Galaxy und gnubg ist.

---

## 8. Stand der Umsetzung (12.11.2026)

**Erledigt:**

- **Phase A** ohne die Betreiberangaben: V1/V2, S1–S9, S11, S12, Recht (Seiten, Export, Löschen, Fristen, Quellcode-Link), Betrieb, UI/UX-Punkte 1–5 und 6–10, Doku.
- **Phase B:**
  - Barrierefreiheit: Brett per Tastatur und Screenreader, Fokus in Dialogen, Kontrast, reduzierte Bewegung.
  - Hinweise, Lade- und Fehlerzustände, Update-Hinweis.
  - Tests: protocol, rng, Turniere; CI mit Audit, Docker, CodeQL, Dependabot.
- **Phase C:** Matchanalyse für Spieler, `.mat`-Export, Rating-Verlauf, Variantenbeschreibungen, Freunde mit Herausforderung, Zuschauen (mit Verzögerung, private Spiele für Freunde), Tutorial, Regeln mit Diagrammen, Tagesrätsel.

**Offen ohne Eingaben von dir:**

- Neuronales Netz, Clubs/Ligen, weitere Varianten, Play Store per TWA

**Offen mit Eingaben von dir:**

- Betreiberangaben für Impressum und Datenschutz
- SMTP, OAuth
- Kalibrierung der Fair-Play-Schwellen mit echten Daten
- Push im echten Betrieb
- Regel-Feinheiten (Mana-Ausnahmen, Fevga)
