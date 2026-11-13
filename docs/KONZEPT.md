# Backgammon/Tavli – Neuaufbau: Konzept & Plan

Stand: 2026-11-12

## Entscheidungen

| Thema             | Entscheidung                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Varianten         | Alle: Backgammon, Portes, Plakoto, Fevga (= Tavli), jeweils als Einzelspiel und Match bis N Punkte, auch offline              |
| Plattform         | Nur Web, als PWA (installierbar, offline spielbar)                                                                            |
| Vorgehen          | Neubau; Legacy-Code (Angular 6) nur als Referenz und Quelle für Testfälle                                                     |
| Lizenz            | Open Source, **AGPL-3.0** (GPL-kompatibel, erlaubt GNUbg-Komponenten, schützt den gehosteten Server)                          |
| Optik             | Zwei wählbare Stile: _Klassisch_ (Holz, Filz, 3D-Würfel) und _Modern_ (flach). Der Renderer ist austauschbar.                 |
| Hosting Testphase | Frontend kostenlos (Cloudflare Pages oder GitHub Pages), Backend per Docker Compose auf dem eigenen Linux-VPS                 |
| Monetarisierung   | Das Basisspiel bleibt vollständig frei. Optional Cosmetics, Supporter-Status und Features, die echte Serverkosten verursachen |

## Architektur

```
pnpm-Monorepo (Turborepo erst bei Bedarf)
├─ packages/engine     reines TS, keine Abhängigkeiten, unveränderlicher und deterministischer Zustand
│   ├─ state           26 Punkte + Bar/Off als Int8Array, Würfelwürfel, Match-Score, Crawford
│   ├─ rules/*         Regel-Plugins: backgammon | portes | plakato | fevga
│   ├─ movegen         ALLE legalen Zugsequenzen eines Wurfs (Regeln für max. Würfelnutzung, höheren Würfel, Pasch)
│   ├─ actions         roll | move | double | take | pass | resign | confirm | undo
│   ├─ match           Match bis N, Crawford, Jacoby (Money-Game), Punktwertung je Variante
│   └─ notation        Spielprotokoll (Standardnotation), XGID / GNUbg-ID Import/Export
├─ packages/ai         Bots (laufen im Web Worker bzw. Worker-Thread)
├─ packages/protocol   Action-/Event-Typen (zod): Protokoll = Replay = Netzwerkformat
├─ packages/ui-board   BoardRenderer-Interface + SVG-Renderer (+ später R3F-3D)
├─ apps/web            React 19, Vite, TS strict, Zustand, TanStack Router, Tailwind + shadcn/ui, PWA, Dexie
└─ apps/server         (Online-Phase) Colyseus + Better Auth + Postgres (Drizzle)
```

**Umgesetzt wurde bewusst schlanker** (Stand heute):

- `packages/engine`, `packages/ai`, `packages/protocol` wie geplant; kein eigenes `ui-board`-Paket, das SVG-Brett liegt in `apps/web/src/board`
- `apps/web`: React 19, Vite, Zustand, Tailwind 4, Motion, eigene History-Navigation statt TanStack Router, eigene UI-Bausteine statt shadcn/ui, Archiv in localStorage (200 Partien) statt Dexie; 3D-Würfel mit three.js ohne Physik-Engine
- `apps/server`: eigener WebSocket-Server (`ws`) statt Colyseus, SQLite (`node:sqlite`) statt Postgres/Drizzle, eigene Konten (scrypt, Sitzungen) statt Better Auth; reicht für eine Instanz mit einigen hundert gleichzeitigen Spielern

Grundprinzip: Eine Partie ist ein Protokoll von Actions. `apply(state, action)` ist rein.
Dieselbe Engine läuft im Browser, im Bot-Worker und auf dem Server. Wiederholung, Statistik, Undo und Netzwerk-Sync
bauen auf diesem Protokoll auf.

## Darstellung

- `BoardRenderer`-Interface: Eingaben sind Zustand, legale Ziele, Theme und Animations-Events; Ausgaben sind Callbacks wie `onMove`.
- **SVG + Motion** als Standard für beide Stile (Klassisch mit Holz- und Filz-Texturen, Modern flach). Steine bewegen sich auf einem Bogen, dazu Schlag- und Abtrag-Animation, Drag & Drop **und** Tippen zum Ziehen über Pointer-Events.
- **3D-Würfel** als React-Three-Fiber-Overlay mit Rapier-Physik. Sie landen auf dem vorher bestimmten Ergebnis von Engine bzw. Server. Abschaltbar, mit 2D-Fallback.
- Später optional ein volles 3D-Brett als Premium-Theme hinter demselben Interface.
- Barrierefreiheit: Bedienung per Tastatur, ARIA-Beschriftungen für die Punkte, Modus für reduzierte Bewegung.

## KI („so stark wie leicht möglich“)

| Stufe                   | Technik                                                                                                       | Varianten          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| Einsteiger              | zufällig oder gierig                                                                                          | alle               |
| Mittel                  | heuristische Bewertung (Pips, Blots, Primes, Anker, Hit-Wahrscheinlichkeit, Fortschritt beim Abtragen), 1-Ply | alle               |
| Stark                   | 2-Ply-Expectimax mit Pruning                                                                                  | alle               |
| Experte (BG/Portes)     | Open-Source-Netz: **wildbg** (Rust → WASM) evaluieren, Fallback GNUbg-Gewichte (GPL, dank AGPL zulässig)      | Backgammon, Portes |
| Experte (Plakoto/Fevga) | eigenes kleines Netz, per Self-Play (TD(λ)) trainiert, im Browser über ONNX Runtime Web                       | Plakoto, Fevga     |

- Für Plakoto und Fevga gibt es keine fertigen starken Engines. Hier ist eigenes Training nötig, als späteres Arbeitspaket.
- Verdopplungsentscheidungen: Heuristik + Match Equity Table (frei verfügbare MET, z. B. Kazaross-XG2).
- Hinweise und Analyse (Fehler, Equity) offline über dieselben Bots.

## Online (später)

- **Colyseus** als autoritativer Spielserver, mit Würfeln vom Server (Commit-Reveal → nachweislich fair), Zeitlimit, Neuverbindung.
- **Better Auth** (selbst gehostet, Postgres): Gastspiel ohne Konto, E-Mail/Magic-Link, GitHub/Google OAuth.
- **Postgres + Drizzle**: Nutzer, Partien (Action-Protokoll), Ratings, Statistiken. Redis erst ab mehreren Server-Instanzen.
- **Rating:** FIBS-Formel (berücksichtigt die Matchlänge), getrennt pro Variante. Matchmaking über ein Rating-Fenster, das mit der Wartezeit wächst.
- **Fair Play:** Zuggenauigkeit im Vergleich mit dem Experten-Bot als Hinweis auf Bot-Nutzung.
- **VPS-Setup:** `docker compose` mit Caddy (TLS), Server und Postgres. Für die Testphase reichen 1–2 GB RAM.

## Monetarisierung (optional, Basisspiel immer frei)

Da der Code Open Source ist, ist eine Bezahlschranke im Client sinnlos. Sinnvoll ist nur:

- **Cosmetics:** Premium-Brett-, Stein- und Würfel-Themes, 3D-Brett, Soundpacks, Profilrahmen
- **Supporter-Status** nach dem Lichess-Modell (Badge, Unterstützung des Projekts)
- **Dienste mit Serverkosten:** Rollouts und Analyse ganzer Partien in der Cloud, unbegrenztes Online-Archiv, private Clubs und Turniere

## Phasen

| Phase         | Inhalt                                                                                                                                                          | Ergebnis                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0 Fundament   | Monorepo, GitHub Actions CI, Biome, Vitest, Legacy-Code nach `legacy/`, Repo aufräumen (`.DS_Store`, `coverage/`), Lizenz                                       | Lauffähiges Grundgerüst   |
| 1 Engine      | Zustand, Movegen (vollständige Sequenzen), 4 Varianten, Verdopplungswürfel, Match/Crawford, Notation, XGID; Legacy-Specs portiert + Property-Tests (fast-check) | Geprüfte Regel-Bibliothek |
| 2 Offline-MVP | SVG-Brett (beide Stile), Drag & Drop/Tippen, Hotseat, Dialog für neues Spiel (Variante, Farbe, Matchlänge, Gegner), Undo/Bestätigen, Protokoll, Settings, PWA   | Spielbar ohne Netz        |
| 3 Bots        | Worker, Stufen Einsteiger bis Stark für alle Varianten, Verdoppeln                                                                                              | Mensch gegen PC           |
| 4 Feinschliff | 3D-Würfel, Sounds, Wiederholung, lokale Statistiken, Hinweise                                                                                                   | Fertiges Spielgefühl      |
| 5 Experten-KI | wildbg/GNUbg per WASM, Self-Play-Training für Plakoto/Fevga                                                                                                     | Starke Bots + Analyse     |
| 6 Online      | Server, Auth, Matchmaking, Rating, Rangliste, Archiv, Deployment auf dem VPS                                                                                    | Mehrspieler               |
| 7 Community   | Freunde, Einladungen, Turniere, Chat, Cosmetics-Shop                                                                                                            | Spielerbindung            |

## Offene Punkte

- Lizenz und WASM-Tauglichkeit von wildbg prüfen, ebenso den Umfang der Unterstützung für Verdoppeln und Match-Play.
- Grafiken für das klassische Theme (Holz-, Filz-Texturen): selbst erstellen oder CC0-Quellen.
- Domain/Name für das Hosting.

## Stand der Umsetzung

### Phase 0 – Fundament ✅

- pnpm-Workspace, TypeScript (strict), Biome, Vitest, GitHub Actions CI
- Legacy-Code unter `legacy/`, Lizenz AGPL-3.0

### Phase 1 – Engine (`packages/engine`) – Kern ✅

- Unveränderlicher Zustand, reiner Reducer `applyAction(state, action)`, Würfel kommen von außen (Seed/Server)
- Zuggenerierung über vollständige Sequenzen: maximale Würfelnutzung, höherer Würfel, Pasch, Bar-Pflicht, Abtragen mit höherem Würfel nur vom hintersten Punkt; ein spielbeendender Zug zählt als vollständige Würfelnutzung
- Varianten: Backgammon (Würfel, Gammon/Backgammon, Jacoby), Portes, Plakoto (Pinnen, Freigeben, Mana-Regel), Fevga (kein Schlagen, Startregel, Prime-Verbot)
- Verdopplungswürfel (double/take/drop), Aufgeben, Undo, Bestätigen
- Match: Länge N oder unbegrenzt, Crawford, Tavli-Rotation Portes → Plakoto → Fevga, Gewinner beginnt das nächste Tavli-Spiel
- Notation (`64: 24/18 13/9`, `44: 8/4* 8/4 4/off(2)`), Pip-Count, Seeded- und Crypto-RNG
- Tests: portierte Legacy-Fälle, Regeltests je Variante, Property-Tests mit zufälligen Partien (fast-check)

### Offen in Phase 1

- ~~XGID Import/Export~~ (erledigt), GNUbg-ID
- Regel-Feinheiten prüfen: Fevga-Startregel bei blockiertem Läufer (aktuell: andere Steine dürfen dann ziehen), Prime-Prüfung pro Einzelzug statt am Zugende, Plakoto-Mana-Ausnahmen
- ~~Aufgabe mit Annahme/Ablehnung~~ (erledigt)

### Phase 2 – Offline-MVP (`apps/web`) ✅

- React 19, Vite, Tailwind 4, Zustand (Spielstand + Einstellungen in localStorage, Partie fortsetzbar), Motion für Animationen
- SVG-Brett mit den Stilen _Klassisch_ (Holz, Filz) und _Modern_ (flach); Punktnummern aus Sicht des Spielers am Zug
- Ziehen per Tippen (Stein → Ziel) und per Drag & Drop (Maus und Touch); Ziele über mehrere Würfel werden als Kette angeboten (z. B. 24/13 mit 6-5)
- Stein-Identitäten für flüssige Animationen (Schlagen, Bar, Abtragen, Undo); gepinnte Plakoto-Steine liegen sichtbar unten
- Mensch gegen Mensch am selben Gerät, neues Spiel mit Variante/Tavli-Rotation, Matchlänge und Namen
- Verdopplungswürfel mit Annehmen/Aufgeben-Dialog, Aufgeben (einfach/Gammon/Backgammon), Ergebnis- und Match-Dialog, Crawford-Anzeige
- Automatisch würfeln (nur wenn Verdoppeln nicht möglich ist), automatisches Passen bei „kein Zug“, optional automatisch beenden
- Deutsch/Englisch, PWA (installierbar, offline via Service Worker), GitHub-Pages-Workflow

### Offen in Phase 2

- alles erledigt (E2E-Tests, Sounds, 3D-Würfel, Hoch- und Querformat)

### Phase 3 – Computergegner (`packages/ai`) ✅

- Bewertungsfunktion je Variante (Backgammon/Portes: Rennen, Blot-Risiko, Punkte, Primes, Anker, Bar; Plakoto: gepinnte Steine, Pin-Risiko inkl. Mana; Fevga: Blockaden vor dem Gegner)
- Blot-/Pin-Risiko zählt nur für die Seite, die gerade gezogen hat – das war entscheidend, damit die 2-Zug-Suche hilft
- Stufen: _Einsteiger_ (1-Zug mit Rauschen und Zufallszügen), _Mittel_ (beste 1-Zug-Bewertung), _Stark_ (2-Zug-Expectimax über die besten Kandidaten)
- Verdoppeln/Annehmen über Gewinnwahrscheinlichkeit: Rennformel (Normalapproximation) bzw. logistische Kurve, je Variante per Selbstspiel kalibriert; match-bewusst (toter Würfel, Post-Crawford)
- Läuft im Web Worker; Mensch-gegen-Computer mit Stärke- und Farbwahl im Dialog „Neues Spiel“
- Benchmarks: `pnpm --filter @tavli/ai bench` (Stärke) bzw. `… bench -t calibrate` (Kalibrierung)

| Variante   | Mittel vs. Einsteiger | Stark vs. Mittel   |
| ---------- | --------------------- | ------------------ |
| Backgammon | 93 %                  | 61 % (100 Partien) |
| Portes     | 93 %                  | 57 % (100 Partien) |
| Plakoto    | 92 %                  | 63 % (24 Partien)  |
| Fevga      | 87 %                  | 58 % (24 Partien)  |

### Offen in Phase 3 / Ausblick Experten-KI

- ~~Gewichte per Selbstspiel~~, ~~Gammons, Match-Equity-Table~~, ~~Hinweis-Funktion~~ (erledigt)
- ~~Neuronales Netz für Backgammon~~ (erledigt, Stufe „Experte“); Netze für die anderen Varianten vertagt; wildbg per WASM als Alternative für Backgammon

### Phase 4 – Feinschliff ✅

- 3D-Würfelwurf (three.js + React Three Fiber) als nachgeladenes Overlay (eigener Chunk, ~244 KB gzip), abschaltbar; danach übernehmen die 2D-Würfel
- Soundeffekte per Web Audio synthetisiert (Würfel, Steine, Schlag, Verdopplung, Spielende) – keine Audiodateien, abschaltbar
- Tipp-Funktion: der starke Bot schlägt einen Zug vor (nummerierte Pfeile + Notation)
- Lokales Archiv beendeter Partien, Wiederholung (Schritte, Autoplay, Schieberegler, Tastatur, Sprung über den Verlauf)
- Statistik gegen den Computer nach Stärke und Variante (Siegquote, Gammons/Mars, Serie, letzte Partien)

### Bot-Tuning per Selbstspiel

- Bewertungsgewichte in `packages/ai/src/weights.ts`, Tuning per (1+1)-Evolutionsstrategie mit gepaarten Partien: `pnpm --filter @tavli/ai tune <variante> [iterationen] [partien]`, Validierung mit `… tune <variante> 0 400 validate`
- Ergebnisse (getunt gegen Ausgangsgewichte, 400 unabhängige Partien, 1-Zug-Bot):
  - Backgammon: **57,0 %** · Portes: **56,8 %** · Plakoto: **58,5 %** · Fevga: **63,0 %** (300 Partien)
- Eröffnungszüge des starken Bots (`npx tsx scripts/openings.ts`): 10 von 15 entsprechen den Standardzügen, bei 21/32/41/43 bevorzugt er sichere Läufer statt Aufbau

### Usability-Verbesserungen

- Auto-Würfeln mit abbrechbarem 3-s-Countdown, wenn Verdoppeln möglich ist; Zug automatisch beenden optional mit 3-s-Verzögerung
- Ereignis-Banner über dem Brett (kein Zug möglich inkl. Grund, nur n von m Würfeln spielbar, ausgesperrt, Anwurf, Pasch, geschlagen/eingeklemmt, Verdopplung, Crawford); würfelbezogene Banner erscheinen erst, wenn die 3D-Würfel liegen
- Ausgesperrt (Bar gegen geschlossenes Heimfeld): Zug entfällt ohne Würfeln (Engine-Aktion `pass`)
- Ruhiger Übergang 3D → 2D-Würfel, Ausblenden statt Flackern; realistischerer synthetischer Würfelsound

> Hinweis: Die folgenden „Phase 5“-Abschnitte entsprechen in der Phasentabelle oben Phase 6 (Online); die Experten-KI (Tabelle: Phase 5) steht noch aus.

### Phase 5 – Online-Modus ✅ (Basis)

- Entscheidung: eigener schlanker WebSocket-Server (`ws` + `node:http`) statt Colyseus – wir übertragen nur kleine JSON-Nachrichten, die State-Sync von Colyseus würde nicht genutzt
- `packages/protocol`: zod-validierte Client-Nachrichten, typisierte Server-Nachrichten und REST-Typen
- `apps/server`: autoritativer Server – würfelt kryptografisch sicher, prüft jede Aktion mit der Engine
  - Matchmaking-Warteschlange je Variante/Länge, private Einladungen per Code/Link
  - Reconnect mit Karenzzeit (90 s), sonst Aufgabe; Zugzeit 60 s (Verdopplung 30 s), bei Ablauf zieht ein Bot, nach 3 Zeitüberschreitungen Aufgabe
  - Gast-Profile mit Token (kein Passwort), FIBS-Rating je Variante mit Erfahrungsfaktor, Rangliste, Profile, Match-Archiv – SQLite über `node:sqlite`
  - Integrationstests mit echten WebSocket-Clients
- Web: Online-Lobby (Profil, Gegner suchen, Freund einladen, Code eingeben, Rangliste), Spiel über den Server mit denselben Animationen, Zugzeit-Uhr, Gegnerstatus, Match aufgeben, Rating-Änderung am Ende; lokale Partie bleibt während Online-Spielen erhalten
- Deployment: `deploy/docker-compose.yml` mit Server und Caddy (liefert App aus, proxyt `/api` und `/ws`, automatisches HTTPS); GitHub-Pages-Variante über Repo-Variable `TAVLI_SERVER_URL`

### Phase 5b ✅

- Brett-Perspektive: der eigene Startpunkt liegt immer oben rechts, das Heimfeld unten rechts (Schwarz: vertikal gespiegelt, Fevga: 180° gedreht) – online, gegen den Bot und in Wiederholungen
- Rating-Matchmaking: Suchfenster ±100, wächst um 10 Punkte pro Sekunde Wartezeit; der nächstliegende Gegner im Fenster wird bevorzugt
- Revanche nach Matchende mit getauschten Farben (beide müssen zustimmen; Ablehnen, neue Suche oder Verbindungsende ziehen zurück)
- Einstellungen auch im laufenden Spiel (Seitenleiste), neu gestaltet; Fix: leeres Brett nach Neuladen + Fortsetzen

### Phase 5c ✅

- Konten: Gastprofil per Benutzername + Passwort (scrypt) sichern, Rating und Partien bleiben; Anmeldung auf weiteren Geräten mit eigener Sitzung je Gerät, Abmelden beendet die Sitzung; Passwort ändern (API)
- Online-Replays: Partien jedes Matches vom Server (mit Ergebnis je Spiel), abrufbar im eigenen Profil und über Spielerprofile aus der Rangliste; Wiederholung mit Spielauswahl
- Handbuch: vollständiges Regelwerk aller Varianten (wie in der Engine umgesetzt, inkl. Auslegungen) plus App/Notation/Online-Regeln – im Spiel als Seitenleiste (öffnet beim Kapitel der laufenden Variante) und im Menü
- Ereignis-Banner oben auf dem Brett statt über den Würfeln; der Computer wartet bei „kein Zug“/„ausgesperrt“ nur noch ~1 s

### Fair Play ✅

- Geräte-ID je Browser: zwei Profile vom selben Gerät werden in der öffentlichen Suche nie gepaart, private Partien zwischen ihnen sind ungewertet
- Gleiches Netzwerk (IP, hinter Caddy über X-Forwarded-For; nur im Speicher, nicht in der Datenbank): ebenso; abschaltbar mit `ALLOW_SAME_NETWORK=1` (lokale Tests, LAN-Abende)
- Höchstens 3 gewertete Matches pro Spielerpaar in 24 Stunden, weitere sind ungewertet
- Abzeichen „Ungewertet“ mit Grund im Spiel und im Ergebnis; Regeln im Handbuch beschrieben

### Weitere Punkte ✅

- Nachweisbar faire Würfel (Commit-Reveal mit Client-Seeds, HMAC-SHA256, Prüfung im Browser)
- Zugzeit-Uhr korrekt (Zeitbasis), WebSocket-Nachrichtenlimit, Passwort ändern
- Handy im Hochformat: um 90° gedrehtes Brett mit ~45 % größeren Steinen, kompakte Kopfzeile
- Playwright-E2E-Tests im Repo (lokales Spiel, Einstellungen/Regeln, Wiederholung, Online mit Einladung/Aufgabe/Würfelprüfung/Rangliste, Konto auf Zweitgerät, Hochformat) und als CI-Job

### Aufgabe, Stellungen, Moderation ✅

- Aufgabe mit Annahme/Ablehnung (Engine: `offer-resign`/`accept-resign`/`reject-resign`): gegen Computer und online wird angeboten, der Bot entscheidet über erwartete Punkte (Gewinn- und grobe Gammon-Chance); online ein Angebot pro Zug, Antwortzeit wie beim Verdoppeln, bei Zeitablauf entscheidet der Bot
- Sofortige Aufgabe ohne Zustimmung gibt online und gegen den Computer das höchste noch mögliche Ergebnis ab (verhindert „einfach aufgeben“ kurz vor einem Gammon)
- XGID-Export (Seitenleiste, inkl. Würfel, Würfel-Besitz, Matchstand, Crawford) und -Import beim neuen Spiel (Backgammon, Portes)
- Brett-Orientierung: Heimfeld links (ganzes Brett gespiegelt, inkl. Ablage und 3D-Würfel)
- Emotes im Online-Spiel (feste Liste, kein freier Chat, Rate-Limit, ausblendbar)
- Melden von Gegnern (nur aus gemeinsamen Matches, je Match einmal, max. 10 pro Tag)
- Moderation: `ADMIN_TOKEN` aktiviert die Admin-API (Meldungen, Spielerinfo, Sperren/Entsperren, Erledigt); Oberfläche unter `?admin`; gesperrte Profile werden getrennt, können sich nicht mehr anmelden und fehlen in der Rangliste

### Fair-Play-Signale und Turniere ✅

- Zuganalyse nach jedem Online-Match (Worker-Thread, `dist/analysis-worker.js`; ohne die Datei inline in kleinen Schritten): jede nicht erzwungene Zugentscheidung wird mit dem starken Bot verglichen (Übereinstimmung) und 1-Zug-bewertet (Fehler in Punkten); gespeichert je Match und Spieler
- Referenzwerte aus Selbstspiel: Einsteiger-Bot 24–34 %, Mittel 70–88 %, Stark 100 % Übereinstimmung; Signal „spielt wie der Bot“ ab 92 % über mindestens 150 Entscheidungen (90 Tage)
- Weitere Signale: häufige Abbrüche/Aufgaben (≥ 30 % von ≥ 8 Matches), „Dumping“ (≥ 3 gewertete Matches in 30 Tagen an denselben Gegner verloren durch Abbruch oder Aufgabe in den ersten Zügen)
- Moderation: Reiter „Signale“ mit Kennzahlen und Sperren-Knopf; Spielerinfo zeigt Übereinstimmung und Ø-Fehler. Nur Hinweise, keine automatischen Strafen
- Turniere: K.-o. mit 4/8/16 Spielern, Setzliste nach Rating (1 gegen n …), Start sobald voll; jedes Match ein normales gewertetes Online-Match, startet wenn beide online und frei sind (10 s Pause nach dem vorigen Match); 5 Minuten Abwesenheit oder Rückzug = kampflos verloren; offene Turniere verfallen nach 24 h; ein aktives Turnier je Spieler; Zustand in SQLite, nach Neustart werden laufende Matches neu angesetzt
- Oberfläche: Reiter „Turniere“ (Erstellen, Beitreten, Verlassen/Zurückziehen, Turnierbaum mit Wiederholung beendeter Matches), Abzeichen im Spiel, nach dem Match „Zum Turnier“

### Schweizer System, Push, Zugzeiten ✅

- Turniere im Schweizer System (3 Runden, bei 16 Spielern 4; mit 4 Spielern ein Jeder-gegen-jeden): Paarung nach Siegen ohne Wiederholungen (Backtracking), Freilos für den Schwächsten ohne bisheriges Freilos, Tabelle nach Siegen, Buchholz, Setzplatz; zurückgezogene Spieler werden nicht mehr gepaart
- Web Push ohne Fremddienst-Konto: VAPID-Schlüssel erzeugt der Server selbst (in SQLite), Verschlüsselung nach RFC 8291 mit node:crypto; Benachrichtigung, wenn ein Turniermatch bereit ist und der Spieler nicht verbunden ist; bei offener App im Hintergrund-Tab eine lokale Benachrichtigung; nur Endpunkte der bekannten Push-Dienste
- Fair-Play-Signal „auffällig gleichmäßige Zugzeiten“: Bedenkzeit je Zugentscheidung mit echter Wahl (Würfeln bis Bestätigen), Streuung von ln(Sekunden) ≤ 0,35 über ≥ 100 Züge; Menschen liegen meist bei 0,7–1,0. Schwelle noch nicht mit echten Spielerdaten kalibriert

### Härtung, Datenschutz, Bedienung ✅ (nach dem Review, siehe `docs/REVIEW.md`)

- Aufgabe gibt nie mehr ab als noch möglich (Backgammon nur mit Kontakt, Stein auf der Bar oder im Heimfeld des Gewinners)
- Server: asynchrones scrypt, Sitzungsablauf, Passwortwechsel beendet andere Sitzungen, Limits (IPv6 je /64, Verbindungen je Adresse, Fehlversuche je Konto, Einladungscodes), Namensfilter, Turniere für Gäste erst nach 3 Matches, Security-Header in Caddy
- Datenschutz: Datenexport und Profil löschen in der App, Aufbewahrungsfristen (Gäste ohne Matches 30 Tage, Fair-Play-Daten 180 Tage, Meldungen 1 Jahr), Impressum und Datenschutzerklärung (Betreiberangaben per Build-Variablen), Quellcode-Link
- Betrieb: tägliche Sicherung per `VACUUM INTO`, Health-Check mit Datenbank, Absturzschutz, Hinweis vor Neustart, Log-Rotation, Docker-Build und Audit in der CI, Dependabot, CodeQL, Pages erst nach grüner CI
- Bedienung: Zurück-Taste, Fokus in Dialogen, Hoch-/Querformat auf dem Handy, Verbindungs- und „Du bist dran“-Hinweise, übersetzte Fehler, Update-Hinweis statt automatischem Neuladen

### Freunde und Zuschauen ✅

- Freundschaften: Anfrage per Freundes-Link (`?friend=<id>`), aus der Rangliste oder nach einem Match; annehmen, ablehnen, entfernen; höchstens 200 Einträge, 30 Anfragen pro Stunde
- Freundesliste mit Online-Status (online, spielt, offline); mit Profil bleibt die App verbunden, damit Freunde einen sehen
- Herausforderung eines Freundes (Variante, Länge): erscheint beim Freund als Dialog auf jedem Bildschirm, verfällt nach 60 Sekunden, Status für den Herausforderer (wartet, abgelehnt, nicht frei, abgelaufen); das Match ist privat
- Zuschauen: Reiter „Live“ mit laufenden öffentlichen Matches (Warteschlange und Turniere, beste Ratings zuerst), Ansicht nur zum Lesen mit Stand, Pips, Uhr und Zuschauerzahl; laufende öffentliche Matches von Freunden direkt aus der Freundesliste; private Einladungs- und Freundesspiele sind nicht zu sehen; höchstens 50 Zuschauer je Match

### Lernen ✅

- Regelbuch mit Brett-Diagrammen (echtes Brett, Pfeile für die gezeigten Züge): Zugrichtung, Schlagen und Bar, Abtragen, Plakoto-Aufstellung und Einklemmen, Fevga-Aufstellung und Sechser-Sperre; ein Test prüft, dass jede Stellung gültig und jeder Pfeil ein legaler Zug ist
- Tutorial mit sechs Lektionen auf vorbereiteten Stellungen (Ziehen, Schlagen, Einsetzen, Abtragen, Plakoto-Einklemmen, Fevga-Läufer): selbst ziehen, Tipp mit Pfeilen, Ziel wird geprüft; jede Lektion ist per Test mit ihrem Tipp lösbar
- Tagesrätsel: aus dem Datum erzeugt (Selbstspiel des starken Bots mit Seed), daher für alle gleich und offline verfügbar; erste Entscheidung ab dem 6. Zug mit mindestens 4 Möglichkeiten und klarem besten Zug (≥ 0,06 Punkte vor dem zweitbesten); Variante wechselt täglich; erster Versuch zählt, Serie gelöster Tage, Lösung mit Pfeilen

### Geldspiel online, GNU-Backgammon-Formate ✅

- Geldspiel online (Länge „Geld“ in Warteschlange, Einladung, Herausforderung): Spiel um Spiel mit Verdopplungswürfel und Jacoby-Regel, nie gewertet; die Session läuft, bis ein Spieler sie beendet – zwischen zwei Spielen regulär, während eines Spiels gibt er dieses zum höchstmöglichen Ergebnis ab; dann entscheidet der Punktestand (bei Gleichstand gewinnt, wer bleibt); keine Geldspiele in Turnieren; Beaver/Raccoon nicht umgesetzt
- GNU-Backgammon-ID (Position-ID:Match-ID) als Export neben der XGID und als Import beim neuen Spiel (XGID oder GNUbg-ID); geprüft an der Startstellung (`4HPwATDgc/ABMA`) und der Match-ID eines neuen Geldspiels (`cAkAAAAAAAAA`), Rundlauf für Würfel, Würfelbesitz, Stand und Crawford
- .mat-Import (GNU Backgammon, eXtreme Gammon, Jellyfish) in der Statistik: Partien werden in der Wiederholung geöffnet und können analysiert werden; jeder Zug wird über die Engine gegen die Endstellung geprüft (Ketten und Mehrfachzüge in beliebiger Schreibweise), Fehler nennen Spiel und Zug

### Fernpartien, Erfolge, Designs ✅

- Fernpartien mit Freunden (ein Zug pro Tag): Einladung mit Variante, Länge (auch Geldspiel) und 1, 3 oder 7 Tagen pro Entscheidung; Zustand in SQLite, Würfel vom Server, jede Entscheidung ein Request; Push „Du bist am Zug“ mit Link in die Partie; wer die Frist verpasst, verliert; beendete Partien im Match-Archiv (ungewertet); höchstens 20 offene je Spieler
- Erfolge (15) aus lokalen Spielen, Rätseln, Tutorial, Online-Profil und Turnieren, mit Fortschritt in der Statistik und Hinweis beim Freischalten
- Freischaltbares: Bretter Marmor, Nacht, Turnier, Olive, goldene und Rubin-Würfel, Würfelbecher-Sound, Siegesfeuerwerk, Avatar-Rahmen (Gold, Lorbeer, Flamme, Stern, Doktorhut – für alle sichtbar neben dem Namen); Klassisch, Modern und Hoher Kontrast sind immer frei (Kontrast ist Barrierefreiheit, keine Belohnung)

- Erfolge, Tutorial-Fortschritt und Rätsel-Ergebnisse werden mit dem Profil synchronisiert und geräteübergreifend zusammengeführt (früheste Freischaltung, erste Rätsel-Antwort zählt); der Server erlaubt einen Rahmen nur, wenn der Erfolg im gespeicherten Fortschritt steht. Erfolge sind kosmetisch und werden vom Gerät gemeldet, nicht serverseitig nachgerechnet

### Clubs und Ligen ✅

- Clubs: gründen mit Konto oder nach 3 Matches (wie Turniere), Name eindeutig, Beschreibung, offen (direkt beitreten) oder geschlossen (Anfrage, ein Admin bestätigt); Rollen Gründer, Admin, Mitglied; höchstens 100 Mitglieder, höchstens 10 Clubs je Spieler; Suche nach Namen; Mitglieder sehen sich mit Online-Status; verlässt der Gründer den Club, übernimmt der dienstälteste Admin bzw. das dienstälteste Mitglied
- Ligen: Admins legen eine Saison an (Variante, Länge, 1–8 Wochen), Mitglieder melden sich an (3–16), der Admin startet; jeder spielt einmal gegen jeden, live per Herausforderung aus der Ligatabelle (Variante und Länge gibt die Liga vor), gewertet und öffentlich zuschaubar; 2 Punkte pro Sieg, dann Punktdifferenz, dann direkter Vergleich; Saisonende nach Ablauf oder wenn alles gespielt ist, ungespielte Partien bleiben ohne Punkte; Erfolg „Meister“ für den Ligasieg; nach einem Server-Neustart können abgebrochene Ligaspiele neu gespielt werden
- Ligen als Fernpartien: alternativ zur Live-Liga starten mit der Saison alle Paarungen als Fernpartien (1, 3 oder 7 Tage pro Zug, ohne Freundschaft, nicht auf das Limit offener Fernpartien angerechnet, ungewertet wie alle Fernpartien); ein verpasster Zug verliert die Partie und zählt für die Tabelle; am Saisonende (bis 12 Wochen) enden offene Partien ohne Wertung
- Divisionen: 1–4 Divisionen je Saison (je 3–16 Spieler), Rundenturnier innerhalb der Division; die erste Saison wird nach Rating eingeteilt; „Nächste Saison“ übernimmt Einstellungen und Teilnehmer (sofern noch Mitglied), an jeder Divisionsgrenze steigen die Besten auf und die Letzten ab (je 1, ab 6 Spielern je 2), Neue beginnen unten; Meister ist der Sieger der 1. Division; Saisons sind vor/zurück verlinkt
- Club-Turniere: Admins legen auf der Club-Seite Turniere an (K.-o. oder Schweizer System wie öffentliche Turniere); nur Mitglieder sehen sie und können teilnehmen; die Gastregel entfällt, da die Mitgliedschaft das Kriterium ist; Turnierbaum im Reiter Turniere mit Club-Hinweis
- Kein Club-Chat (bewusst: bräuchte Moderation)

### Tavla und Narde ✅

- Tavla (türkisch): Backgammon-Aufstellung, Schlagen, kein Doppler, Anwurf-Gewinner würfelt neu, Mars = 2 (kein Dreifachsieg); nach bkgm.com zusätzlich kein Hit-and-run im eigenen Heimfeld (der schlagende Stein bleibt im Wurf stehen) und keine verschenkten Augen beim Abtragen; XGID und .mat wie Portes
- Narde (Long Nardy): alle Steine auf dem Kopf, Köpfe diagonal gegenüber, gleiche Laufrichtung wie Fevga, Einzelsteine blockieren, pro Wurf nur ein Stein vom Kopf (erster Wurf 6-6, 4-4, 3-3: zwei), kein Sechserblock ohne gegnerischen Stein davor, Mars = 2; nicht umgesetzt: Koks/Haus-Mars (inoffiziell) und das Turnier-Unentschieden
- Engine: Zugkontext (`TurnContext`) für Regeln, die vom bisherigen Wurf abhängen; Bot nutzt die Bewertung von Portes bzw. Fevga
- Online, Turniere, Ligen und Ranking automatisch für beide Varianten

### Hypergammon, zügige Fernpartien, Schachuhr ✅

- Hypergammon: je 3 Steine auf 24, 23, 22, sonst Backgammon-Regeln mit Doppler; offline, online, Turniere, Ranking
- Fernpartien mit 1 oder 8 Stunden pro Entscheidung zusätzlich zu 1, 3, 7 Tagen; Gegnersuche für Fernpartien (gleiche Variante, Länge, Bedenkzeit; ungewertet; Suche verfällt nach 7 Tagen, höchstens 5 offene Suchen)
- Bedenkzeit für Live-Matches: Entspannt (60 s pro Zug, Computer zieht bei Ablauf, 3× = Matchverlust), Standard (12 s Verzögerung + 2 min Reserve pro Punkt) und Blitz (8 s + 1 min pro Punkt); leere Reserve = Matchverlust („Zeit abgelaufen“), Züge ohne Wahl kosten keine Reserve; wählbar in Gegnersuche, Einladung, Herausforderung, Turnieren und Live-Ligen

### Ratings nach Tempo, Liga-Bedenkzeit ✅

- Blitz-Matches haben ein eigenes Rating und eine eigene Rangliste je Variante (wie Blitz/Klassisch im Schach); Entspannt und Standard teilen das normale Rating. Speicherung: Schlüssel `<variant>@blitz` in der Ratings-Tabelle, Spalte `pool` im Matcharchiv; Matchmaking, Turnier- und Liga-Setzliste nutzen das passende Rating
- Live-Ligen haben eine Bedenkzeit (Entspannt/Standard/Blitz), die für alle Ligaspiele gilt, egal was der Herausforderer wählt; Fernligen bleiben ohne Uhr

### Neuronales Netz (Stufe „Experte“) ✅

- Bewertung wie TD-Gammon: Eingaben je Seite 4 Einheiten pro Feld (1, 2, 3, >3 Steine), Bar, abgetragen, Pips (Plakoto zusätzlich gefangene Steine), eine Sigmoid-Schicht, 5 Ausgaben (Sieg, Gammon-/Backgammon-Sieg, Gammon-/Backgammon-Niederlage, ohne Würfel) aus Sicht des Spielers am Zug
- Training durch Selbstspiel mit TD(0): `pnpm --filter @tavli/ai train-nn <modell> [partien] [hidden]`, Worker-Threads teilen sich die Gewichte (Hogwild); Ergebnis als int16-Gewichte in `src/nets/<modell>.ts`, im Browser erst bei Bedarf geladen
- „Experte“ = Netz + 2-Ply-Suche wie „Stark“; Würfel- und Aufgabe-Entscheidungen ebenfalls mit dem Netz. Wo kein Netz trainiert ist, spielt „Experte“ wie „Stark“ und wird im Menü nicht angeboten
- Partie-Analysen und Tipps nutzen das Netz; die Fair-Play-Analyse bleibt vorerst bei der kalibrierten Heuristik
- Backgammon-Netz: 500 000 Selbstspiel-Partien, 96 versteckte Einheiten (~2 h mit 12 Threads). Experte gegen Stark ohne Würfel 39/60 Siege (65 %, +0,43 Punkte/Partie), mit Würfel 74/100. Mit Würfel eskaliert der Würfel zwischen Netz und Heuristik teils extrem (beide halten sich für Favorit) – Punkte pro Partie sind dort nicht aussagekräftig
- Netze für Hypergammon, Portes/Tavla, Plakoto, Fevga/Narde: noch nicht trainiert (`tuning/train-rest.sh`)
- Stärketest: `scripts/nn-duel.ts <variante> [partien] [gegner] [snapshot] [nocube]`

### Beaver und Raccoon, Doppler-Obergrenze ✅

- Geldspiel offline auf Wunsch mit Beaver (annehmen und sofort zurückverdoppeln, Würfel bleibt beim Annehmenden) und Raccoon (der Verdoppler verdoppelt vor dem Würfeln noch einmal und behält den Würfel); beides kann nicht abgelehnt werden. Der Computer beavert/raccoont als klarer Favorit (> 0,05 Punkte pro Partie). Online vorerst nicht (kein Server-Protokoll)
- Gegen den Computer geht der Doppler höchstens bis 64 (`MatchConfig.cubeLimit`)

### Termine für Turniere und Ligen ✅

- Turniere optional mit festem Starttermin (5 Minuten bis 60 Tage voraus): Anmeldung bis dahin (auch neben anderen Turnieren), zum Termin Start mit allen Angemeldeten, die nicht gerade ein anderes Turnier spielen; mindestens 4, sonst abgesagt. K.-o.: Feld auf die nächste Zweierpotenz, die besten Gesetzten bekommen Freilose. Offene Turniere mit Termin verfallen nicht nach 24 h
- Ligen optional mit Starttermin: Start von selbst, wenn genug Spieler (3 je Division) dabei sind, sonst bleibt die Liga offen und ein Admin startet sie später
- Club-Seite: Karte „Termine“ mit den kommenden Ligen und Turnieren

### Offen / nächste Schritte Online

- E-Mail-Bestätigung/Passwort-Reset (braucht SMTP), OAuth-Login (Google/GitHub, braucht Client-IDs)

### Gammons und Matchstand im Bot ✅

- Gammon-Modell je Variante: P(Gammon | Sieg) = σ(a + b·z + c·Anteil draußen), z = Wettlauf „Verlierer bringt alle Steine heim und trägt einen ab“ gegen „Gewinner trägt alles ab“; per logistischer Regression auf Selbstspiel ohne Würfel gefittet und auf neuen Partien geprüft (Vorhersage und Ergebnis je Dezil auf wenige Prozent gleich); alle Steine des Verlierers daheim: exakte Rennformel
- Mittel/Stark ziehen nach erwarteten Punkten (Gewinn-, Gammon-, Backgammon-Chancen beider Seiten, Jacoby beachtet) statt nach reiner Bewertung. Selbstspiel ohne Würfel, je 400 Partien, gegen „nur Sieg“: Backgammon +0,15 ± 0,06, Portes +0,10 ± 0,06, Fevga +0,13 ± 0,06, Plakoto ±0 Punkte pro Partie
- Match-Equity-Table: Pre-Crawford bis 7-away nach Kazaross XG2, sonst berechnet (Gammonrate 27 %, Pre-Crawford-Spiele zählen doppelt, Crawford-Spiel ohne Würfel, danach verdoppelt der Zurückliegende sofort, Free Drop ergibt sich; Tavli ohne Würfel mit gemessener Mars-Rate je Variante)
- Verdoppeln/Annehmen nach Matchstand: No Double / Double-Take / Double-Pass mit Matchgewinnchancen, Take-Punkt mit Würfelbesitz (TP = TP_tot · (1 − x · TP_Redouble), x = 0,68 Kontakt / 0,8 Rennen; Geldspiel ≈ 21 %), verdoppelt kurz vor dem Pass-Punkt, „too good“ spielt weiter. 5-Punkte-Matches, Würfelentscheidungen nach Matchstand gegen Geldspiel-Logik: 52,8 % ± 1,4 (1 200 Matches, zwei Seeds: 55,0 % und 50,5 %) – ein kleiner, noch nicht ganz gesicherter Vorteil; Stark gegen Mittel weiter 57,5 % (mit Würfel) bzw. 55,0 % (ohne), je 160 Partien
- Aufgabe-Angebote entscheidet der Bot ebenfalls nach Matchgewinnchance (z. B. nimmt er „einfach“ an, wenn das das Match gewinnt)
- Bewusst **nicht** übernommen: Züge nach Matchgewinnchance gewichten (voll oder nur „tote Gammons“) – im Selbstspiel 2–4 % weniger Matchgewinne (Kontrollläufe mit identischen Bots ±2 %); vermutlich gleicht der Gammon-Term Schwächen der Gewinnschätzung aus. Erst mit einer besseren Bewertung (z. B. neuronales Netz) wieder prüfen
- Benchmarks: `test/gammon.bench-test.ts` (Fit und Kalibrierung), `test/equity.bench-test.ts` (A/B Gammons, A/B Würfel nach Matchstand, Kontrolle mit `AB_MODE=none`)
