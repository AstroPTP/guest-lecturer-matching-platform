# Guest Lecturer Matchmaking Platform

A web platform that connects **unit coordinators** who need guest lecturers with **guest speakers** from industry, administered by **CCAE administrators**.

- Guest speakers and unit coordinators build profiles, discover each other, send match requests and message once matched.
- Unit coordinators can get a ranked shortlist of suggested speakers for a session.
- Administrators approve accounts, handle reports and support requests, review the audit log, and tune matching and system settings in a separate admin portal.

> **Taking over this project?** Start with **[SETUP.md](SETUP.md)**. It covers deploying on your own server with Docker (Part A) and setting up a developer machine (Part B).

---

## Architecture

```
          Browser
      ┌──────┴──────┐
      ▼             ▼
  frontend        admin            Next.js apps. The browser only ever talks to these.
  :3000           :3002            Each forwards API calls server-side via /api/backend.
      └──────┬──────┘
             ▼
          backend                  NestJS API, :3001. Not exposed to the internet.
             │
     ┌───────┴────────┐
     ▼                ▼
 PostgreSQL         Auth0          Sign-in and roles (guest_speaker,
 (Supabase, or a                   unit_coordinator, ccae_admin).
  local container)
```

| Part | Folder | Tech | Port |
|---|---|---|---|
| Main site (guest speakers, unit coordinators) | [frontend/](frontend/) | Next.js, React | 3000 |
| Admin portal (CCAE administrators) | [frontend/admin/](frontend/admin/) | Next.js, React | 3002 |
| API | [backend/](backend/) | NestJS, Prisma | 3001 |
| Database schema and migrations | [backend/prisma/](backend/prisma/) | PostgreSQL 16 | 5432 |
| Stand-in identity provider for offline development | [tools/dev-idp/](tools/dev-idp/) | Node.js | 9099 |

All three apps run on Node.js **22.13** (see [.nvmrc](.nvmrc)).

## Quick start (Docker)

On a machine with Docker installed, after filling in the four environment files described in [SETUP.md](SETUP.md#a2-configure):

```bash
docker compose up -d --build
```

This builds the three apps, applies any pending database migrations, and starts everything. Check it with:

```bash
docker compose ps
```

## Documentation

| Document | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Deployment, configuration, local development, operations, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branching, commits, pull requests, automated checks |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Expected behaviour and how to report problems |
| [SECURITY.md](SECURITY.md) | Supported branches and how to report a vulnerability privately |
| [backend/.env.example](backend/.env.example) | Every API setting, with what it does and where to obtain it |
| [frontend/FRONTEND.md](frontend/FRONTEND.md) | Frontend structure and conventions |
| [tools/dev-idp/README.md](tools/dev-idp/README.md) | Running sign-in without an Auth0 account |

## License

Released under the [MIT License](LICENSE.md).
