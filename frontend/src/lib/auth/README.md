# Frontend auth

How a signed-in user reaches the API, and why the access token never touches
JavaScript.

## The shape of it

```
browser                      Next server                    NestJS API
   |                              |                              |
   |-- /auth/login -------------> |                              |
   |     Auth0 SDK redirect       |                              |
   |<-- session established ----- |                              |
   |                              |                              |
   |-- backendFetch("/users") --> |                              |
   |   same origin, no token      |-- Bearer <token> ----------> |
   |                              |   attached server-side       |
   |<-- json ------------------- |<---------------------------- |
```

| File | Runs on | Does |
|---|---|---|
| `lib/auth0.js` | server | The Auth0 SDK client |
| `middleware.js` | server | Login, callback, logout, and route gating |
| `lib/auth/session.ts` | server | Reads the token and the claims out of the session |
| `lib/auth/roles.ts` | either | Reconciles the three role vocabularies |
| `app/api/auth/session/route.ts` | server | Claims for the browser, never the token |
| `app/api/backend/[...path]/route.ts` | server | Attaches the token to API calls |
| `lib/api/backendClient.ts` | browser | `backendFetch()`, what components call |
| `components/auth/SessionProvider.tsx` | browser | `useCurrentUser()` |

## Calling the API

```ts
import { backendFetch } from "@/lib/api/backendClient";

const speakers = await backendFetch<GuestSpeaker[]>("/guest-speakers");
```

Never call the backend directly from a component. Going through `/api/backend`
is what keeps the token server-side, and it also makes browser traffic
same-origin so CORS does not apply to it.

## Reading the signed-in user

```tsx
const { user, isLoading } = useCurrentUser();

if (isLoading) return <Spinner />;      // do not treat this as signed out
if (!user) return <SignedOut />;

return <p>{user.email} · {user.accountRole}</p>;
```

Hold the render while `isLoading`. On first paint the session has not been
fetched, and redirecting on that bounces a signed-in user to the login page on
every load.

## Three things not to undo

1. **The token is never returned to the browser.** `/api/auth/session` returns
   claims only. If a token ever appears in a JSON response or a non-HttpOnly
   cookie, the property this whole arrangement exists for is gone.
2. **`/api/backend` strips `authorization` and `cookie` from the incoming
   request** before forwarding. Accepting a caller-supplied `Authorization`
   header would let the browser choose its own credentials.
3. **Nothing here is an authorisation decision.** Hiding a control with
   `useCurrentUser()` is a convenience. The API verifies the token's signature
   and re-reads the roles on every request, and refuses regardless of what the
   browser concluded.

## Roles

Roles come from the namespaced claim `https://glmp.curtin.edu.au/roles`. A
missing or malformed claim yields an empty array, never a default role, so a
misconfigured identity provider closes every guarded route rather than opening
them.
