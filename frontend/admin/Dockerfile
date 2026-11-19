# Next.js image for the administrator portal (CCAE administrators).
# Built by docker-compose.yml at the repository root.

# Pinned to match .nvmrc and CI. Change all three together.
FROM node:22.13-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# NODE_ENV=production at build time is what drops 'unsafe-eval' and the
# websocket allowance from the Content-Security-Policy in next.config.ts.
RUN NODE_ENV=production npm run build && npm prune --omit=dev --ignore-scripts && npm cache clean --force


FROM node:22.13-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./

USER node
EXPOSE 3002
CMD ["npx", "next", "start", "--port", "3002"]
