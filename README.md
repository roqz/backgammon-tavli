# Backgammon & Tavli

Open-source Backgammon and Greek Tavli (Portes, Plakoto, Fevga) for the web: an offline-first PWA with
games against the computer and on one device, plus online play with ratings, matchmaking, private
invites, friends and challenges, clubs with leagues, correspondence games, live spectating, tournaments (knockout and Swiss) and provably fair
dice.

> Status: rewrite on branch `rewrite/foundation`. The original 2018 Angular proof of concept lives in
> [`legacy/`](legacy/). Concept and roadmap (German): [`docs/KONZEPT.md`](docs/KONZEPT.md); latest review and
> plan: [`docs/REVIEW.md`](docs/REVIEW.md).

## Structure

| Path                | Content                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/engine`   | Pure, deterministic rules engine: all four variants, cube, match play, notation, XGID           |
| `packages/ai`       | Computer opponents: evaluation per variant with gammon model, search, cube decisions, MET       |
| `packages/protocol` | Client/server messages and REST payloads (zod schemas), fair-dice helpers                       |
| `apps/web`          | React 19 + Vite PWA: SVG board (classic / modern), tap and drag input, online screens           |
| `apps/server`       | Authoritative game server: WebSocket + REST, SQLite, ratings, tournaments, moderation, Web Push |
| `deploy/`           | Docker Compose for a single VPS: Caddy (HTTPS, static app, reverse proxy) and the game server   |
| `legacy/`           | Old Angular 6 / Express implementation (reference only)                                         |

## Development

Requires Node.js ≥ 22.5 (for `node:sqlite`) and pnpm (`corepack enable`).

```sh
pnpm install
pnpm --filter @tavli/server dev   # game server: ws://localhost:2567/ws, REST under /api
pnpm --filter @tavli/web dev      # web app on http://localhost:5173 (uses the local server)
pnpm test        # all unit tests
pnpm typecheck
pnpm lint        # Biome; `pnpm format` to fix
pnpm check       # lint + typecheck + test (same as CI)
pnpm --filter @tavli/server build && pnpm --filter @tavli/web build
pnpm --filter @tavli/web e2e      # Playwright (PW_CHANNEL=msedge to use an installed browser)
```

## Engine in a nutshell

```ts
import { applyAction, createGame, legalMoves, rollDice, cryptoRng } from "@tavli/engine";

let game = createGame({ variant: "backgammon" });
game = applyAction(game, { type: "roll", dice: rollDice(cryptoRng) }); // opening roll
const moves = legalMoves(game); // legal next single moves for the player on turn
```

Dice are always passed in from outside, so the same engine runs in the browser, in bot workers and on the
authoritative server.

## Online play

Players start as guests (a random profile key in the browser) and can turn the profile into an account
with username and password to play on several devices. The server rolls the dice from a committed secret
and both clients' seeds; after each match the app verifies every roll. Ratings follow the FIBS formula per
variant.

### Self-hosting (Docker)

```sh
cd deploy
DOMAIN=tavli.example.com \
OPERATOR_NAME="Jane Doe" OPERATOR_ADDRESS="Street 1|12345 City" OPERATOR_EMAIL=tavli@example.org \
HOSTING="Example Hosting GmbH" VAPID_SUBJECT=mailto:tavli@example.org ADMIN_TOKEN=<long random secret> \
docker compose up -d --build
```

Caddy serves the web app with security headers (CSP, HSTS) and proxies `/api` and `/ws` to the server on
the same domain. The SQLite database lives in the `tavli-data` volume; a daily consistent copy is written
to `/data/backups` (14 kept) – copy those off the server as well.

| Server variable                         | Purpose                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PORT`, `HOST`, `DB_PATH`               | Listen address and database file                                                         |
| `TRUST_PROXY=1`                         | Behind a reverse proxy: client address from the last `X-Forwarded-For` entry             |
| `CORS_ORIGIN`                           | Allowed origin for REST calls from a separately hosted frontend (default `*`)            |
| `ADMIN_TOKEN`                           | Enables moderation (at least 16 characters); open the app with `?admin`                  |
| `ANALYSIS=off`                          | Disables the fair-play move analysis (worker thread `dist/analysis-worker.js`)           |
| `VAPID_SUBJECT`, `PUSH=off`             | Contact for the browser push services; push is on by default (keys generated and stored) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Pin the push keys (raw, base64url)                                                       |
| `BACKUP_DIR`, `BACKUP_KEEP`             | Daily database copies and how many to keep                                               |
| `ALLOW_SAME_NETWORK=1`                  | Local testing: pair profiles from the same network                                       |
| `SPECTATOR_DELAY_SECONDS`               | Spectators see matches this much later (default 0 = live)                                |
| `TOURNAMENT_SPECTATOR_DELAY_SECONDS`    | Separate delay for tournament matches (default: as above)                                |
| `TOURNAMENT_GUEST_MIN_MATCHES`          | Finished matches a guest needs before creating a tournament (default 3)                  |

The web build reads `VITE_SERVER_URL` (`same-origin` behind Caddy) and, for imprint and privacy notice,
`VITE_OPERATOR_NAME`, `VITE_OPERATOR_ADDRESS` (lines separated by `|`), `VITE_OPERATOR_EMAIL` and
`VITE_HOSTING`. For GitHub Pages set the repository variables `TAVLI_SERVER_URL`, `TAVLI_OPERATOR_*` and
`TAVLI_HOSTING`.

Privacy: players can download their data and delete their profile in the app. Guests without matches are
removed after 30 days of inactivity, fair-play data after 180 days, resolved reports after a year; IP
addresses are only held in memory.

## License

[AGPL-3.0-or-later](LICENSE). The app links to its source code; if you host a modified version, point
`VITE_SOURCE_URL` to your source.
