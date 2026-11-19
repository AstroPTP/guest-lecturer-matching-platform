# Setup guide

This guide has two parts. Most readers only need one of them.

- **[Part A — Deploying on a server](#part-a--deploying-on-a-server)**: run the whole platform with Docker on your own machine. No Node.js needed on the server.
- **[Part B — Local development](#part-b--local-development)**: change the code and run it on a developer laptop.

Then: [Operations](#operations) · [Troubleshooting](#troubleshooting) · [Rules for the team](#rules-for-the-team)

> The original team never had access to the production host, so Part A is written to be followed from a clean machine. Anything specific to your network (domain names, HTTPS certificates, firewall) is called out as **your decision**.

---

## How the pieces fit

| Service | What it is | Listens on | Who reaches it |
|---|---|---|---|
| `frontend` | Main site for guest speakers and unit coordinators | `3000` | Browsers |
| `admin` | Administrator portal | `3002` | Browsers (administrators) |
| `backend` | NestJS API | `3001` | Only `frontend` and `admin`, over the internal Docker network. Published on `127.0.0.1` for health checks. |
| `migrate` | Applies pending database migrations, then exits | — | Runs automatically before `backend` starts |
| `db`, `pgadmin` | Optional local PostgreSQL and its browser | `5432`, `5050` on `127.0.0.1` | Only with `--profile local-db` |

The database is **PostgreSQL 16**. The team used a hosted Supabase database; a local container is available as an alternative (see [A5](#a5-optional-run-the-database-locally)). Sign-in is handled by **Auth0**.

---

## Part A — Deploying on a server

### A1. Prerequisites

| Requirement | Notes |
|---|---|
| Docker Engine 24+ with Docker Compose v2.20+ | Linux: [Docker Engine](https://docs.docker.com/engine/install/). Windows/macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop). Check with `docker compose version`. |
| Git | To fetch the code. |
| ~4 GB free RAM during the first build, ~1.5 GB while running | The Next.js builds are the heavy part. |
| A PostgreSQL 16 database | The Supabase project, your own server, or the optional container in [A5](#a5-optional-run-the-database-locally). |
| An Auth0 tenant | See [A3](#a3-auth0). |
| HTTPS in front of the sites | **Your decision** how: a reverse proxy such as nginx, Caddy, Traefik or IIS, or a load balancer. Sign-in cookies, push notifications and the security headers all assume HTTPS in production. |

Get the code:

```bash
git clone https://github.com/AstroPTP/guest-lecturer-matching-platform.git glmp
cd glmp
git checkout main
```

### A2. Configure

There are four environment files. Each has a committed template next to it; copy it and fill it in. **Never commit the filled-in files** (`.gitignore` already excludes them).

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.local.template frontend/.env.local
cp frontend/admin/.env.local.template frontend/admin/.env.local
```

In the examples below, the sites are served at `https://glmp.example.edu.au` and `https://admin.glmp.example.edu.au`. Replace them with your own addresses.

#### `.env` (Docker Compose itself)

Every value has a sensible default. Change only what you need:

| Variable | Default | When to change |
|---|---|---|
| `BIND_ADDRESS` | `0.0.0.0` | Set `127.0.0.1` if a reverse proxy on the same machine forwards to the sites, so ports 3000/3002 are not reachable directly. |
| `FRONTEND_PORT`, `ADMIN_PORT`, `BACKEND_PORT` | `3000`, `3002`, `3001` | A port is already taken on the host. |
| `NEXT_PUBLIC_MATCHING_SUGGESTIONS` | `true` | To remove "Suggested speakers" from the build. Keep it equal to `MATCHING_SUGGESTIONS_ENABLED` in `backend/.env`. |
| `DB_*`, `PGADMIN_*` | — | Only with the local database ([A5](#a5-optional-run-the-database-locally)). |

#### `backend/.env` (the API)

Every variable is explained in [backend/.env.example](backend/.env.example). The API **refuses to start** if a required value is missing or malformed, and the error names each one. For production, check these in particular:

| Variable | Production value |
|---|---|
| `NODE_ENV` | Ignored: Docker sets `production`. |
| `PORT` | Ignored: Docker sets `3001`. |
| `FRONTEND_URL` | **Both** public site origins, comma-separated, no trailing slash: `https://glmp.example.edu.au,https://admin.glmp.example.edu.au` |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the sites, usually `1`. Never `true`. |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | Your tenant's domain (bare, no `https://`) and API identifier. |
| `AUTH0_MANAGEMENT_CLIENT_*`, `AUTH0_SETTINGS_CLIENT_*` | From the two Auth0 applications in [A3](#a3-auth0). |
| `DATABASE_URL`, `DIRECT_URL` | Pooled (runtime) and direct (migrations) connection strings. Percent-encode special characters in the password. With a plain PostgreSQL server both can be the same URL. |
| `DEMO_AUTH_BYPASS` | `false`. It is ignored in production anyway. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional, for push notifications. Generate once: `docker run --rm node:22.13-bookworm-slim npx -y web-push generate-vapid-keys`. Keep the same pair forever after. |
| `RETENTION_DRY_RUN` | Consider `true` for the first week, then `false` (see the comment in the file). |

#### `frontend/.env.local` (main site)

| Variable | Value |
|---|---|
| `APP_BASE_URL` | Public address of the main site, e.g. `https://glmp.example.edu.au` |
| `AUTH0_DOMAIN` | Same tenant domain as the API |
| `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | From the main site's Auth0 application |
| `AUTH0_SECRET` | A random 32-byte value, unique to this site: `openssl rand -hex 32` |
| `AUTH0_AUDIENCE` | Same as the API's `AUTH0_AUDIENCE` |
| `BACKEND_URL` | Ignored: Docker sets `http://backend:3001` |
| `AUTH0_DB_CONNECTION` | Optional. Auth0 database connection name; defaults to `Username-Password-Authentication`. |

#### `frontend/admin/.env.local` (admin portal)

Same variables as the main site, with the admin portal's own Auth0 application, its own `AUTH0_SECRET`, and `APP_BASE_URL=https://admin.glmp.example.edu.au`.

### A3. Auth0

The tenant needs:

1. **An API** whose identifier equals `AUTH0_AUDIENCE`.
2. **A Regular Web Application for the main site.** Allowed Callback URLs: `https://glmp.example.edu.au/auth/callback`. Allowed Logout URLs and Web Origins: `https://glmp.example.edu.au`. Refresh token rotation on, inactivity lifetime 3 days, absolute lifetime 7 days (these must match the session lengths in the code).
3. **A Regular Web Application for the admin portal**, the same, with the admin address.
4. **A Machine to Machine application** authorised for the Auth0 Management API with `read:users update:users delete:users create:users` → `AUTH0_MANAGEMENT_CLIENT_*`.
5. **A Regular Web Application with the Password grant** enabled, used only to re-check a password before sensitive changes → `AUTH0_SETTINGS_CLIENT_*`.
6. **An Action that adds roles** to the ID and access tokens under the claim `https://glmp.curtin.edu.au/roles`. The roles are `guest_speaker`, `unit_coordinator` and `ccae_admin`.

The existing development tenant (`glmp-curtin-dev.au.auth0.com`) is configured this way and can be used as a reference.

### A4. Build and start

```bash
docker compose up -d --build
```

The first build takes several minutes. Order of start-up: `migrate` applies any pending migrations and exits → `backend` starts and becomes healthy → `frontend` and `admin` start.

Check:

```bash
docker compose ps
```

`backend`, `frontend` and `admin` should be `Up` (`backend` also `healthy`); `migrate` should be `Exited (0)`. Then:

```bash
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
```

`/healthz` says the API process is up; `/readyz` also checks the database. Point your uptime monitoring at them.

Finally, configure your reverse proxy to forward the public addresses to `http://127.0.0.1:3000` (main site) and `http://127.0.0.1:3002` (admin portal), passing the `Host` and `X-Forwarded-*` headers. **Do not** publish the API (`3001`) to the internet; nothing needs it.

**Create the first administrator.** Sign up on the main site, then in Auth0 give that user the `ccae_admin` role. They can then sign in to the admin portal and manage everyone else.

> Do **not** run the seed script (`npx prisma db seed`) against production. It inserts demo accounts and data.

### A5. Optional: run the database locally

If you prefer PostgreSQL on the same machine instead of Supabase:

1. In `.env`, set `DB_USER`, `DB_PASSWORD` (a strong one) and `DB_NAME`.
2. In `backend/.env`, set both URLs to the container, using the host `db`:
   ```
   DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@db:5432/<DB_NAME>"
   DIRECT_URL="postgresql://<DB_USER>:<DB_PASSWORD>@db:5432/<DB_NAME>"
   ```
3. Start with the profile, every time:
   ```bash
   docker compose --profile local-db up -d --build
   ```

Data lives in the Docker volume `glmp_postgres_data`. **Back it up** (see [Operations](#operations)). The database and pgAdmin (`http://127.0.0.1:5050`) are published on `127.0.0.1` only.

---

## Part B — Local development

### B1. Prerequisites

- **Docker Desktop**, for the optional local database: https://www.docker.com/products/docker-desktop
- **nvm**, so everyone uses the same Node.js: [macOS/Linux](https://github.com/nvm-sh/nvm) · [Windows](https://github.com/coreybutler/nvm-windows). Restart your terminal after installing.

From the project folder:

```bash
nvm install
nvm use
```

This reads [.nvmrc](.nvmrc) (Node.js 22.13).

### B2. Environment files

Copy the same four templates as in [A2](#a2-configure). For development the defaults in the templates are mostly right:

- `backend/.env`: `PORT=3001`, `NODE_ENV=development`, `FRONTEND_URL=http://localhost:3000,http://localhost:3002`.
- `frontend/.env.local` and `frontend/admin/.env.local`: `BACKEND_URL=http://localhost:3001`.
- No Auth0 account? Run the stand-in identity provider and set `AUTH0_DOMAIN=127.0.0.1:9099` in `backend/.env`. See [tools/dev-idp/README.md](tools/dev-idp/README.md).

Ask the team lead for the real secrets; share them only over a secure channel.

### B3. Install dependencies

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd frontend/admin && npm install && cd ../..
npm install   # root: git hooks (husky), lint-staged, cspell
```

### B4. Database

Either use the shared Supabase database (the URLs in `backend/.env`), or start a local one:

```bash
docker compose --profile local-db up -d db pgadmin
```

With the local database, the API runs **outside** Docker in development, so use `localhost` in `backend/.env`:

```
DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5432/<DB_NAME>"
DIRECT_URL="postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5432/<DB_NAME>"
```

Then create the tables and load demo data:

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

### B5. Run the apps

Three terminals:

```bash
cd backend && npm run start:dev
```

```bash
cd frontend && npm run dev
```

```bash
cd frontend/admin && npm run dev
```

- Main site: http://localhost:3000
- Admin portal: http://localhost:3002
- API: http://localhost:3001

To check the production images locally instead, use Part A with `http://localhost:...` addresses.

### B6. pgAdmin (optional)

With the `local-db` profile running, open http://localhost:5050 and sign in with `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` from `.env`. Register the server once: right-click **Servers → Register → Server**, then on the **Connection** tab use host **`db`** (not `localhost`; pgAdmin runs inside Docker), port `5432`, and your `DB_USER` / `DB_PASSWORD`.

---

## Operations

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Logs (all / one service) | `docker compose logs -f` / `docker compose logs -f backend` |
| Restart one service | `docker compose restart backend` |
| Stop everything | `docker compose down` (keeps database volumes) |
| Apply a changed env file | `docker compose up -d` (recreates services whose configuration changed) |
| Apply a changed `NEXT_PUBLIC_` value | `docker compose up -d --build frontend` |
| Run migrations by hand | `docker compose run --rm migrate` |
| Clean up old images after updates | `docker image prune` |

Add `--profile local-db` to each command when using the local database.

### Updating to a new version

```bash
git pull
docker compose up -d --build
```

Migrations are applied automatically before the new API starts. Take a database backup first.

### Backups

- **Supabase:** use the project's backup settings in the Supabase dashboard.
- **Local database:**
  ```bash
  docker compose --profile local-db exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
  ```
  Restore into an empty database with `psql` the same way.

### Scheduled jobs

Old messages are deleted weekly (Sundays 02:00 UTC) inside the API process; nothing extra to schedule. The `RETENTION_*` settings in `backend/.env` control it.

### Logs

Each container's log is capped at 5 × 10 MB by `docker-compose.yml`, so logs cannot fill the disk.

---

## Troubleshooting

### `env file ... not found`

One of the four environment files is missing. Copy it from its template ([A2](#a2-configure)).

### `migrate` exited with an error, so nothing else started

`docker compose logs migrate` shows why. Usually `DIRECT_URL` is wrong or the database is unreachable from the server. Fix it and run `docker compose up -d` again.

### `backend` keeps restarting

`docker compose logs backend`. An `Environment validation failed` message lists each bad variable in `backend/.env`.

### Sign-in fails or loops back to the login page

- `APP_BASE_URL` must be exactly the address in the browser's address bar, including `https://`.
- The callback URL in Auth0 must be `<APP_BASE_URL>/auth/callback`.
- Both site origins must be in `FRONTEND_URL` in `backend/.env`.
- Behind a proxy, check `TRUST_PROXY_HOPS` and that the proxy forwards `X-Forwarded-Proto`.

### Every API call answers 401

`AUTH0_DOMAIN` or `AUTH0_AUDIENCE` differ between the backend and the sites, or from the tenant. They are compared character for character.

### Port already in use

Change the port in `.env` (`FRONTEND_PORT`, `ADMIN_PORT`, `BACKEND_PORT`, `DB_PORT`) and run `docker compose up -d`.

### Local database container keeps restarting

Usually an empty `DB_PASSWORD` in `.env`, or a volume created by a different PostgreSQL major version. For a **development** database only, wipe and recreate it:

```bash
docker compose --profile local-db down -v
docker compose --profile local-db up -d db
```

`-v` deletes the data. Never do this on a server.

### pgAdmin cannot resolve host `db`

Restart both: `docker compose --profile local-db down` then `docker compose --profile local-db up -d db pgadmin`.

### `nvm` not found after installing

Close and reopen the terminal. If it still fails, check nvm was added to your shell profile (`.bashrc`, `.zshrc`, …).

---

## Rules for the team

- **Never commit an environment file** (`.env`, `backend/.env`, `*.env.local`). Share secrets over a secure channel.
- **Never use `latest` for Docker images.** Pin versions (`postgres:16`, `node:22.13-...`). When upgrading Node.js, change `.nvmrc`, `.circleci/config.yml` and the `Dockerfile` of each app together.
- **Never change the database schema by hand.** Use `npx prisma migrate dev` to create a migration and commit it; servers apply it with `prisma migrate deploy` automatically.
- **Always run `nvm use`** when switching between projects.
