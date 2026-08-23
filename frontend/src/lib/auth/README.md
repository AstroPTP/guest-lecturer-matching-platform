# Frontend auth

How a user signs in, where the token lives, and how calls reach the NestJS API.
Owner: Naveen (security). Backend counterpart: `backend/src/auth/README.md`.

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local
node ../tools/dev-idp/server.js   # in another terminal
npm run dev
```

Then sign in at `/dev_login`. No Auth0 account needed.

## The short version

The access token is held in an **HttpOnly cookie** and read only on the server.
Browser code never touches it. API calls go to `/api/backend/...` on our own
origin, and that route handler attaches the bearer token server-side.

That is the whole design, and it is why checklist items TAM-01 and TAM-02 hold
rather than being aspirational: the token cannot be read from `document.cookie`,
cannot be lifted by injected script, and never exists in a JavaScript variable.
It also means browser traffic is same-origin and never touches CORS.

## What is where

| File | Runs | Purpose |
|---|---|---|
| `lib/auth/config.ts` | server | Env reading, `devLoginEnabled()` |
| `lib/auth/session.ts` | server | Cookie read/write, claim decoding |
| `app/api/auth/*` | server | Sign in, session, logout |
| `app/api/backend/[...path]` | server | Proxy to NestJS, attaches the token |
| `lib/api/backendClient.ts` | browser | `backendFetch()` — the only way to call the API |
| `components/auth/SessionProvider.tsx` | browser | `useCurrentUser()` |
| `services/auth/authService.ts` | browser | Stable API used by `LoginForm` and `DashboardSidebar` |
| `src/proxy.ts` | proxy | Route protection |

## Calling the API

Always through `backendFetch`. A hand-rolled `fetch` to port 3001 is silently
unauthenticated and returns a 401 that looks like a backend fault.

```ts
import { backendFetch, BackendError } from "@/lib/api/backendClient";

try {
  const me = await backendFetch<{ id: string; roles: string[] }>("/auth/whoami");
} catch (error) {
  if (error instanceof BackendError) {
    // error.code is the SAS §2.5.5 code, e.g. AUTHZ_INSUFFICIENT_ROLE
    // error.correlationId matches the backend log line
  }
}
```

## Reading the signed-in user

```tsx
const { user, isLoading } = useCurrentUser();

if (isLoading) return null;
if (!user) return <SignedOut />;
```

**Check `isLoading` before treating a null user as signed out**, or a signed-in
user is bounced to `/login` on every page load.

`app/guest_lecturer/settings/page.tsx` is the worked example. The other fifteen
dashboard pages still read `DEMO_*` constants from `config/demoUsers.ts`;
converting one is the same three lines each time.

## Connecting the real Auth0 tenant

Currently `/dev_login` posts an email to the dev IdP's token endpoint. Real Auth0
uses a redirect to its hosted login (Authorization Code + PKCE), per SAS §2.5.1.

**One function changes.** In `services/auth/authService.ts`,
`authenticateAccount()` currently does:

```ts
await fetch("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ email }) });
```

That becomes a redirect to Auth0's `/authorize`, with the callback exchanging
the code for a token and setting the same cookie via `sessionCookieOptions()` in
`lib/auth/session.ts`. Everything downstream — the cookie, the proxy, the
session provider, the guards — is unchanged, because none of it cares how the
token was obtained.

The backend needs `AUTH0_DOMAIN` pointed at the tenant and nothing else.

## Three things not to undo

1. **`useCurrentUser()` is not an authorisation check.** Hiding a button with it
   is a UI convenience. Roles here come from the browser's copy of the token,
   and the browser is the thing we do not trust. The backend re-verifies the
   signature on every request.
2. **`decodeClaims()` does not verify the signature**, and must not be used to
   decide access. It renders a name and picks a menu. The comment on it says so.
3. **`/dev_login` and `/api/auth/dev-login` must stay gated.** They issue a
   signed token for an email with no password. `devLoginEnabled()` requires an
   explicit opt-in and is always false when `NODE_ENV` is production.
