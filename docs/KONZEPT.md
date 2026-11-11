# Backgammon/Tavli – Neuaufbau: Konzept & Plan

Stand: 2026-11-11

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

- XGID / GNUbg-ID Import/Export
- Regel-Feinheiten prüfen: Fevga-Startregel bei blockiertem Läufer (aktuell: andere Steine dürfen dann ziehen), Prime-Prüfung pro Einzelzug statt am Zugende, Plakoto-Mana-Ausnahmen
- Aufgabe mit Annahme/Ablehnung (für Online-Modus)

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

- Playwright-E2E-Tests ins Repo übernehmen (lokal per Headless-Edge geprüft)
- Brett-Orientierung (Heimfeld links/rechts), Sounds, schönere Würfelwurf-Animation (3D kommt in Phase 4)
- Hochformat auf dem Handy: Brett nutzt die Breite noch nicht optimal
