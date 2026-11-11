# Game server: bundled into a single file, no node_modules at runtime.
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tavli/server..." \
 && pnpm --filter @tavli/server build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=2567 DB_PATH=/data/tavli.db NODE_NO_WARNINGS=1
COPY --from=build /repo/apps/server/dist/server.js ./server.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:2567/api/health || exit 1
CMD ["node", "server.js"]
