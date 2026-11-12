# Backgammon & Tavli

Open-source Backgammon and Greek Tavli (Portes, Plakoto, Fevga) for the web – offline-first PWA,
human vs. human and human vs. computer, with online play planned.

> Status: rewrite in progress. The original 2018 Angular proof of concept lives in [`legacy/`](legacy/).
> Concept and roadmap (German): [`docs/KONZEPT.md`](docs/KONZEPT.md).

## Structure

| Path              | Content                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `packages/engine` | Pure, deterministic rules engine: all four variants, cube, match play, notation            |
| `packages/ai`     | Computer opponents: heuristic evaluation per variant, 1-/2-ply search, cube decisions      |
| `apps/web`        | React 19 + Vite PWA: SVG board (classic / modern), tap & drag moves, hotseat, vs. computer |
| `legacy/`         | Old Angular 6 / Express implementation (reference only)                                    |

## Development

Requires Node.js ≥ 22 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm --filter @tavli/web dev   # web app on http://localhost:5173
pnpm test        # run all tests
pnpm typecheck
pnpm lint        # Biome; `pnpm format` to fix
pnpm check       # lint + typecheck + test (same as CI)
pnpm --filter @tavli/server build && pnpm --filter @tavli/web build
pnpm --filter @tavli/web e2e   # Playwright (PW_CHANNEL=msedge to use an installed browser)
```

## Engine in a nutshell

```ts
import { applyAction, createGame, legalMoves, rollDice, cryptoRng } from "@tavli/engine";

let game = createGame({ variant: "backgammon" });
game = applyAction(game, { type: "roll", dice: rollDice(cryptoRng) }); // opening roll
const moves = legalMoves(game); // legal next single moves for the player on turn
```

Dice are always passed in from outside, so the same engine runs in the browser, in bot workers and on an
authoritative server.

## License

[AGPL-3.0-or-later](LICENSE)

## Online play

`apps/server` is the authoritative game server (WebSocket + REST, SQLite via `node:sqlite`):
matchmaking per variant/length, private invite links, reconnects, turn clock, FIBS ratings and a
leaderboard. Players are guests identified by a token stored in the browser.

```sh
pnpm --filter @tavli/server dev   # ws://localhost:2567/ws, REST under /api
pnpm --filter @tavli/web dev      # the app uses http://localhost:2567 when served from localhost
```

### Self-hosting (Docker)

```sh
cd deploy
DOMAIN=tavli.example.com docker compose up -d --build   # HTTPS via Caddy / Let's Encrypt
```

Caddy serves the web app and proxies `/api` and `/ws` to the server on the same domain. The
SQLite database lives in the `tavli-data` volume. Fair-play checks never pair two profiles from the same
device or network in the public queue (set `ALLOW_SAME_NETWORK=1` for local testing). For a separately hosted frontend (e.g. GitHub
Pages) set the repository variable `TAVLI_SERVER_URL` and `CORS_ORIGIN` on the server.

Moderation: start the server with `ADMIN_TOKEN=<long random secret>` (at least 16 characters) to
enable the admin API; open the app with `?admin` to review player reports and fair-play signals
(agreement with the bot, forfeits, repeated cheap losses) and ban or unban profiles. The move analysis
runs in a worker thread (`dist/analysis-worker.js`, shipped next to `server.js`); `ANALYSIS=off` disables it.

Push notifications (tournament match ready while the app is closed) work without configuration: the
server creates a VAPID key pair on first start and keeps it in the database. Set `VAPID_SUBJECT` to a
contact (`mailto:you@example.org` or an https URL) for the push services; `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (raw, base64url) pin the keys, `PUSH=off` disables push. The server only posts to the
browsers' push services (Google, Mozilla, Apple, Microsoft).
