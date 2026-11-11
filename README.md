# Backgammon & Tavli

Open-source Backgammon and Greek Tavli (Portes, Plakoto, Fevga) for the web – offline-first PWA,
human vs. human and human vs. computer, with online play planned.

> Status: rewrite in progress. The original 2018 Angular proof of concept lives in [`legacy/`](legacy/).
> Concept and roadmap (German): [`docs/KONZEPT.md`](docs/KONZEPT.md).

## Structure

| Path              | Content                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `packages/engine` | Pure, deterministic rules engine: all four variants, cube, match play, notation |
| `legacy/`         | Old Angular 6 / Express implementation (reference only)                         |

## Development

Requires Node.js ≥ 22 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm test        # run all tests
pnpm typecheck
pnpm lint        # Biome; `pnpm format` to fix
pnpm check       # lint + typecheck + test (same as CI)
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
