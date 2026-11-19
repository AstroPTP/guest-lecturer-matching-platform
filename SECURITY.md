# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes. There are no older
release lines.

| Branch    | Supported |
|-----------|-----------|
| `main`    | ✅ |
| `develop` | Fixes land here first, then reach `main` |
| Anything else | ❌ |

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Fill in the form.

Please include:

- Which part is affected: main site (`frontend/`), admin portal (`frontend/admin/`),
  API (`backend/`) or the database schema (`backend/prisma/`)
- Steps to reproduce, or a proof of concept
- What an attacker could do with it
- The commit or branch you tested against

You should get a first reply within 7 days. We will keep you updated while we work
on a fix, and credit you in the advisory unless you ask us not to.

## Scope

In scope:

- Sign-in, tokens and role checks (`backend/src/auth/`, `frontend/src/lib/auth/`)
- Access to another user's data, matches or messages
- Admin portal actions reachable by non-admins
- Rate limiting, security headers and request size limits (`backend/src/main.ts`)
- Push notification handling (`backend/src/notifications/push.ts`, `frontend/public/sw.js`)

Out of scope:

- `tools/dev-idp/`. It is a stand-in identity provider for local development and
  tests, accepts any password by design, and must never run in production.
- Problems that need an attacker to already control the server, the database or an
  Auth0 tenant admin account.
- Missing HTTPS on your own deployment. HTTPS is the deployer's responsibility (see
  [SETUP.md](SETUP.md)).

## Keeping secrets out of the repository

Never commit `.env` files, Auth0 secrets, database passwords or VAPID keys. Commit only
the `.env.example` and `.env.template` files, with placeholder values. If a secret is
committed by mistake, treat it as leaked: rotate it first, then remove it from the history.
