# Setup guide

Follow these steps in order. Do not skip ahead — each step depends on the previous one.

---

## Prerequisites

Install these tools before anything else. You only need to do this once.

### 1. Docker Desktop
Docker runs your local PostgreSQL database. It works the same on Windows, macOS, and Linux.

- Download: https://www.docker.com/products/docker-desktop
- After installing, open Docker Desktop and make sure it is running (look for the whale icon in your taskbar/menu bar)

### 2. nvm (Node Version Manager)
nvm ensures everyone uses the exact same version of Node.js.

- **macOS / Linux:** https://github.com/nvm-sh/nvm
- **Windows:** https://github.com/coreybutler/nvm-windows

After installing nvm, restart your terminal.

### 3. Node.js (via nvm)

Once nvm is installed, run the following from inside the project folder:

```bash
nvm install
nvm use
```

This reads the `.nvmrc` file in the repo and installs the correct Node version automatically.

---

## Project setup

### Step 1 — Clone the repository

```bash
git clone https://21664322@bitbucket.org/curtincomputingprojects/bentley-sem-1-05.git
cd bentley-sem-1-05
```

### Step 2 — Set the correct Node.js version

```bash
nvm use
```

### Step 3 — Set up environment variables

There are two environment files, each sitting next to what reads it:

```bash
cp .env.example .env                  # docker-compose.yml reads this
cp backend/.env.example backend/.env  # the NestJS app reads this
```

Open both and fill in the values. Ask your team lead for the correct values — never commit either file; `.gitignore` already excludes them.

The committed `.env.example` files are the authoritative list of what is needed, and each variable is commented with where to obtain it. Two things catch people out:

- **The backend will refuse to start if a variable is missing or malformed.** That is deliberate. The error names every variable that failed, so read it rather than guessing.
- **`PORT` is `3001`, not `3000`.** The Next.js frontend already owns 3000.

### Step 4 — Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### Step 5 — Install backend dependencies

```bash
cd backend
npm install
cd ..
```

### Step 6 — Start the database

```bash
docker compose up -d
```

This starts PostgreSQL and pgAdmin in Docker. Wait a few seconds for both containers to fully start.

Verify both are running:

```bash
docker compose ps
```

You should see both `db-1` and `pgadmin-1` with `Up` status. If `db-1` shows `Restarting`, see the Troubleshooting section below

### Step 7 — Start the app

Open two separate terminals:

**Terminal 1 — Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 2 — Backend:**
```bash
cd backend
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

---

## pgAdmin (optional visual database browser)

pgAdmin is available at http://localhost:5050 as an alternative to Prisma Studio for browsing the database.

Login with the `PGADMIN_EMAIL` and `PGADMIN_PASSWORD` values from your `.env` file.

### Connecting pgAdmin to the database

You need to register the database server once after first login:

1. Right-click "Servers" in the left panel → "Register" → "Server"
2. Under the **General** tab — set Name to anything you like, e.g. `matchmaking_dev`
3. Under the **Connection** tab, fill in:
   - Host: `db` (not `localhost` — Docker uses the service name internally)
   - Port: `5432`
   - Username: your `DB_USER` value
   - Password: your `DB_PASSWORD` value
4. Click Save

> **Important:** The host must be `db`, not `localhost`. Inside Docker, containers talk to each other using their service name. Using `localhost` will fail.

---

## Useful commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Start PostgreSQL and pgAdmin |
| `docker compose down` | Stop PostgreSQL and pgAdmin |
| `docker compose down -v` | Wipe and restart the database (safe for local dev) |
| `docker compose ps` | Check container status |
| `docker logs <container-name>` | View container error logs |
| `npx prisma studio` | Open visual database browser (run from backend/) |
| `npx prisma migrate dev` | Apply schema changes (run from backend/) |
| `npx prisma db seed` | Re-load seed data (run from backend/) |

---

## Troubleshooting

### Database container keeps restarting

This is almost always caused by a corrupted volume or a version mismatch. Fix it by wiping the volume and starting fresh:

```bash
docker compose down -v
docker compose up -d
```

The `-v` flag deletes the volume. Since this is local dev with only test data, nothing real is lost. Re-run the migration and seed after.

> **Never use `postgres:latest`** in `docker-compose.yml`. Always pin to a specific version like `postgres:16`. The `latest` tag can jump to a new major version and break your setup without warning.

### pgAdmin cannot connect — "failed to resolve host 'db'"

This means the containers are not on the same Docker network. Run:

```bash
docker compose down
docker compose up -d
```

### Port 5432 already in use

Another process (possibly a local PostgreSQL install) is using port 5432. Either stop that process, or change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - '5433:5432'   ← change the left number only
```

Then update your `DATABASE_URL` in `.env` to use port `5433`.

### nvm command not found after install

Close and reopen your terminal. If it still fails, check that nvm was added to your shell profile (`.bashrc`, `.zshrc`, etc.) during installation.

---

## Rules for the team

- **Never commit `.env`** — it is in `.gitignore` for a reason. Share secrets via a secure channel.
- **Never use `latest` for Docker images** — always pin to a specific version.
- **Never modify the database schema directly** — always use `npx prisma migrate dev` to make schema changes. Ad hoc changes will be overwritten and cause conflicts.
- **Always run `nvm use`** when switching between projects to ensure the correct Node version.