import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';

/**
 * Auth routes.
 *
 * The throttle sits on the controller rather than on individual routes, which
 * is what KAN-226 asked for: SRS §6.2 puts the tighter 10/min limit on
 * /auth/*, and a route-level decorator has to be remembered every time a route
 * is added. At controller level a new auth route inherits it.
 *
 * This does not touch Elizabeth's configuration from PR #15 — her 60/min
 * global default and her 10/min on the demo POST /login both stand. This adds
 * the tier for the real auth routes as they arrive.
 */
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  /**
   * Echoes back what the backend concluded about the caller after verifying
   * their token. It is what the threat-model checklist items are run against,
   * and what the frontend can hit to confirm a session is wired up correctly
   * without waiting on GET /users/me.
   *
   * Returns nothing that is not already in the caller's own token, so it
   * discloses nothing they could not read themselves.
   */
  @Get('whoami')
  whoami(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
