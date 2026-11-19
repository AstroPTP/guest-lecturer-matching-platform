# NestJS API image. Built by docker-compose.yml at the repository root.
#
#   build   - installs everything, generates the Prisma client and compiles.
#             Also used, as is, by the one-shot "migrate" service, because
#             `prisma migrate deploy` needs the Prisma CLI and the migrations.
#   runtime - production dependencies and the compiled output only.

# Pinned to match .nvmrc and CI. Change all three together.
FROM node:22.13-bookworm-slim AS build
WORKDIR /app

# `npm ci` runs `prisma generate`, and prisma.config.ts refuses to load without
# DIRECT_URL. Generating the client never connects, so a placeholder is enough.
# It exists only in this stage; the real value comes from backend/.env at run time.
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build

# The Prisma CLI (used by the migrate service) looks for OpenSSL on start-up.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# tsconfig.json must be present before `prisma generate` runs: Prisma reads it
# to decide whether the generated client imports "./x.js" or "./x.ts". Without
# it the client imports .ts files, which compile but fail at start-up.
COPY package.json package-lock.json prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build


FROM node:22.13-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001
CMD ["node", "dist/src/main"]
