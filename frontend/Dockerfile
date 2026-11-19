# Next.js image for the main site (guest speakers and unit coordinators).
# Built by docker-compose.yml at the repository root.

# Pinned to match .nvmrc and CI. Change all three together.
FROM node:22.13-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_ values are written into the JavaScript at build time, so they
# are build arguments, not run-time variables. Changing one means rebuilding:
# docker compose up -d --build frontend
ARG NEXT_PUBLIC_MATCHING_SUGGESTIONS=true
ENV NEXT_PUBLIC_MATCHING_SUGGESTIONS=$NEXT_PUBLIC_MATCHING_SUGGESTIONS

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts && npm cache clean --force


FROM node:22.13-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "--port", "3000"]
