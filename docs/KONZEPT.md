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
- Neuronales Netz je Variante (Selbstspiel, TD(λ)); wildbg per WASM als Alternative für Backgammon

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

### Offen / nächste Schritte Online

- E-Mail-Bestätigung/Passwort-Reset (braucht SMTP), OAuth-Login (Google/GitHub, braucht Client-IDs)
- Turniere: Zeitpläne

### Gammons und Matchstand im Bot ✅

- Gammon-Modell je Variante: P(Gammon | Sieg) = σ(a + b·z + c·Anteil draußen), z = Wettlauf „Verlierer bringt alle Steine heim und trägt einen ab“ gegen „Gewinner trägt alles ab“; per logistischer Regression auf Selbstspiel ohne Würfel gefittet und auf neuen Partien geprüft (Vorhersage und Ergebnis je Dezil auf wenige Prozent gleich); alle Steine des Verlierers daheim: exakte Rennformel
- Mittel/Stark ziehen nach erwarteten Punkten (Gewinn-, Gammon-, Backgammon-Chancen beider Seiten, Jacoby beachtet) statt nach reiner Bewertung. Selbstspiel ohne Würfel, je 400 Partien, gegen „nur Sieg“: Backgammon +0,15 ± 0,06, Portes +0,10 ± 0,06, Fevga +0,13 ± 0,06, Plakoto ±0 Punkte pro Partie
- Match-Equity-Table: Pre-Crawford bis 7-away nach Kazaross XG2, sonst berechnet (Gammonrate 27 %, Pre-Crawford-Spiele zählen doppelt, Crawford-Spiel ohne Würfel, danach verdoppelt der Zurückliegende sofort, Free Drop ergibt sich; Tavli ohne Würfel mit gemessener Mars-Rate je Variante)
- Verdoppeln/Annehmen nach Matchstand: No Double / Double-Take / Double-Pass mit Matchgewinnchancen, Take-Punkt mit Würfelbesitz (TP = TP_tot · (1 − x · TP_Redouble), x = 0,68 Kontakt / 0,8 Rennen; Geldspiel ≈ 21 %), verdoppelt kurz vor dem Pass-Punkt, „too good“ spielt weiter. 5-Punkte-Matches, Würfelentscheidungen nach Matchstand gegen Geldspiel-Logik: 52,8 % ± 1,4 (1 200 Matches, zwei Seeds: 55,0 % und 50,5 %) – ein kleiner, noch nicht ganz gesicherter Vorteil; Stark gegen Mittel weiter 57,5 % (mit Würfel) bzw. 55,0 % (ohne), je 160 Partien
- Aufgabe-Angebote entscheidet der Bot ebenfalls nach Matchgewinnchance (z. B. nimmt er „einfach“ an, wenn das das Match gewinnt)
- Bewusst **nicht** übernommen: Züge nach Matchgewinnchance gewichten (voll oder nur „tote Gammons“) – im Selbstspiel 2–4 % weniger Matchgewinne (Kontrollläufe mit identischen Bots ±2 %); vermutlich gleicht der Gammon-Term Schwächen der Gewinnschätzung aus. Erst mit einer besseren Bewertung (z. B. neuronales Netz) wieder prüfen
- Benchmarks: `test/gammon.bench-test.ts` (Fit und Kalibrierung), `test/equity.bench-test.ts` (A/B Gammons, A/B Würfel nach Matchstand, Kontrolle mit `AB_MODE=none`)
