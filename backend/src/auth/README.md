# Auth module

Authentication and authorisation for the NestJS backend. Owner: Naveen (security).

## Using it

Both guards are registered globally in `auth.module.ts`, so **every route is
protected by default**. You do not add `@UseGuards(...)`.

```ts
@Controller('users')
export class UsersController {
  // Authenticated. Any signed-in user, any role.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findByAuthId(user.id);
  }

  // Authenticated AND holding at least one listed role.
  @Roles(AppRole.CcaeAdmin)
  @Post(':id/roles')
  assignRole() {}

  // No token required. Must match a `Public? = Yes` row in the RBAC Matrix.
  @Public()
  @Get('health')
  health() {}
}
```

**Take the user id from `@CurrentUser()`, never from a route parameter or the
request body.** `user.id` came out of a signed token; `params.id` came from the
caller. Ownership checks built on the second are forgeable.

`user.id` is the Auth0 `sub` claim (e.g. `auth0|65f1a…`), not `users.userid` in
`schema.prisma`. Joining the two is a backend concern for whoever builds
`GET /users/me`.

## What happens to a request

```
Authorization: Bearer <jwt>
        │
        ▼
JwtAuthGuard ──── @Public()? ──── yes ──▶ handler
        │
        ▼  JwtStrategy
   verify RS256 signature against the tenant's JWKS
   check iss, aud, exp
        │
        ├─ no/malformed header ──▶ 401 AUTH_MISSING_BEARER
        ├─ anything else fails ──▶ 401 AUTH_INVALID_TOKEN
        ▼
   request.user = { id, email, roles }   ← roles from the namespaced claim
        │
        ▼
RolesGuard ──── no @Roles()? ──── yes ──▶ handler
        │
        ├─ no role matches ──▶ 403 AUTHZ_INSUFFICIENT_ROLE
        ▼
      handler
```

Errors leave through `GlobalExceptionFilter` as the SAS §2.5.5 envelope:
`{ code, message, correlationId, timestamp }`.

## Four things not to undo

1. **`algorithms: ['RS256']` is explicit.** Without the allowlist, a token
   declaring `{"alg":"none"}` or one signed HS256 using the public key as the
   shared secret can be made to verify. If you refactor `jwt.strategy.ts`, that
   line stays.
2. **The roles claim is namespaced** — `https://glmp.curtin.edu.au/roles`, fixed
   by SAS §2.5.2 Interface 5. Auth0 silently discards custom claims whose name
   is not a URI, so a claim called plain `roles` never reaches the token and
   nothing tells you why.
3. **Roles come from `app_metadata`, never `user_metadata`.** `user_metadata` is
   writable by the end user through Auth0's own endpoints. A role stored there
   is self-assignable.
4. **A missing roles claim means no roles.** Never a default. If the Post-Login
   Action is disabled, everything closes rather than opening.

Guard order — `JwtAuthGuard` then `RolesGuard` — is declared in `auth.module.ts`
and must not be swapped. A signature has to be verified before a role is read,
or an attacker editing the roles array in their own token would be authorised on
the strength of their own edit.

## Configuration

`AUTH0_DOMAIN` and `AUTH0_AUDIENCE` from `backend/.env` — see
`backend/.env.example`. The issuer and JWKS URI are derived from the domain, so
there is one value to get right rather than three. The process will not start if
either is missing or malformed.

`AUTH0_DOMAIN` is a **bare host** — no scheme, no trailing slash. The Auth0
dashboard displays it that way, but people reflexively paste `https://`.

## Running it locally without an Auth0 account

`tools/dev-idp/` issues real RS256 tokens with the same claim. Point
`AUTH0_DOMAIN` at `127.0.0.1:9099` and start it. **Switching to the real tenant
is that one variable — no code change.** See `tools/dev-idp/README.md`.

## Tests

```bash
npm test -- src/auth
```

28 tests, each named for its item in the STRIDE threat-model checklist (SPF-*,
TAM-*, EOP-*, INF-01, REP-06). They generate their own key pairs and serve their
own JWKS over loopback, so they need no tenant, no network and no credentials.

If you add a route that changes who can reach what, add the matching checklist
item rather than only testing the happy path.
