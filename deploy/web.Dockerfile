# Web app served by Caddy; /api and /ws are proxied to the game server (same origin).
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
ENV VITE_SERVER_URL=same-origin
RUN pnpm install --frozen-lockfile --filter "@tavli/web..." \
 && pnpm --filter @tavli/web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
