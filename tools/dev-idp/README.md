# Dev identity provider

A stand-in for our Auth0 tenant, so the auth flow can be run and tested with no
Auth0 account and no network.

```bash
node tools/dev-idp/server.js
```

Then set `AUTH0_DOMAIN=127.0.0.1:9099` in `backend/.env` (already the default in
`backend/.env.example`) and start the backend. **Moving to the real tenant is
that one variable** — no code changes.

## Accounts

| Email | Roles |
|---|---|
| `guest@test.local` | `guest_speaker` |
| `coordinator@test.local` | `unit_coordinator` |
| `admin@test.local` | `ccae_admin` |
| `both@test.local` | `guest_speaker`, `unit_coordinator` |
| `norole@test.local` | none |

Any password. `norole@test.local` is not padding — checklist item **EOP-04**
requires proving a token carrying no roles is denied rather than defaulted, and
that needs an account that genuinely has none.

## Endpoints

| Path | Purpose |
|---|---|
| `/.well-known/openid-configuration` | OIDC discovery |
| `/.well-known/jwks.json` | Public signing key — what the backend verifies against |
| `/oauth/token` | `POST {"username": "..."}` → `{ access_token, token_type, expires_in }` |
| `/dev/users` | The table above, as JSON. Drives the demo login's picker. |

Tokens are real RS256, signed with a key pair generated at startup, carrying
the namespaced claim `https://glmp.curtin.edu.au/roles` exactly as Auth0 does
(SAS §2.5.2 Interface 5). **The backend guard cannot tell this apart from a
real tenant** — that is the whole point. A token from here fails and succeeds
for the same reasons a real one does.

The key pair is regenerated on every start, so restarting the IdP invalidates
every token it issued. Log in again.

## This is dangerous, and here is what stops it

It mints a signed token for anyone who asks, with any role they name. In
production that is a complete authentication bypass. Three gates, none of them
decoration:

1. **Refuses to start when `NODE_ENV=production`.**
2. **Binds `127.0.0.1` only**, never `0.0.0.0` — unreachable off-host even if it
   somehow runs.
3. **Lives outside `backend/` and `frontend/`**, so neither build can import it
   and it cannot be bundled into a deployed artefact by accident.

If you are tempted to relax one of these to make something work, the thing you
actually want is the real Auth0 tenant. Ask Naveen or Liz for access.

## Quick check

```bash
curl -s -X POST http://127.0.0.1:9099/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin@test.local"}'
```

Paste the `access_token` into jwt.io and confirm the roles claim is present.
