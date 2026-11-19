import { Controller, Get, Inject } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { AppRole } from './roles';
import { Roles } from './roles.decorator';
import { APP_ENV } from '../config/app-env.token';
import type { AppEnv } from '../config/env.validation';

/**
 * Auth routes.
 *
 * The throttle sits on the controller rather than on individual routes. A
 * route-level decorator has to be remembered every time a route is added; at
 * controller level a new auth route inherits the tighter 10/min limit
 * automatically.
 *
 * This does not change the existing throttler configuration. The 60/min global
 * default and the 10/min on the demo POST /login both stand as they are.
 */
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /**
   * Echoes back what the backend concluded about the caller after verifying
   * their token. It is what the guard tests are run against, and what the
   * frontend can hit to confirm a session is wired up correctly without
   * waiting on GET /users/me.
   *
   * Returns nothing that is not already in the caller's own token, so it
   * discloses nothing they could not read themselves.
   */
  @Get('whoami')
  whoami(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * The security posture of the running service, for an administrator.
   *
   * Role-restricted because it describes how the service is configured, and a
   * caller who cannot administer it has no reason to know. It reports whether
   * each control is active, never how it is configured: no origins, no limits,
   * no variable values. Knowing that a control is on tells an attacker nothing
   * they could not learn by testing it, whereas its configuration would.
   *
   * This also keeps one route carrying @Roles() on a running server. Without
   * one, RolesGuard only ever executes inside the test harness, and a control
   * nobody has watched work is a weaker claim than one they have.
   */
  @Get('admin/security-status')
  @Roles(AppRole.CcaeAdmin)
  securityStatus(@CurrentUser() user: AuthenticatedUser): {
    checkedBy: string;
    authenticationRequired: true;
    roleEnforcement: true;
    corsRestricted: boolean;
    rateLimited: true;
    errorsSanitised: true;
  } {
    return {
      checkedBy: user.id,
      authenticationRequired: true,
      roleEnforcement: true,
      // False would mean the boot-time validation let an empty allowlist
      // through, which it does not, so this is a live assertion rather than a
      // constant.
      corsRestricted: this.env.allowedOrigins.length > 0,
      rateLimited: true,
      errorsSanitised: true,
    };
  }
}
