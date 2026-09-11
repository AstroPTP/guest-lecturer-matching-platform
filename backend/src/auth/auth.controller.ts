import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { AppRole } from './roles';
import { Roles } from './roles.decorator';

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
   * A route that actually requires a role, for the same reason whoami exists.
   *
   * Until the admin endpoints land there is no route in this application
   * carrying @Roles(), which means RolesGuard has only ever run inside the
   * test harness. Checklist items EOP-01 and EOP-04 could be asserted but not
   * demonstrated, and a control nobody has watched work on a running server is
   * a weaker claim than one they have.
   *
   * It discloses nothing. A caller who is admitted learns only that they hold
   * a role their own token already told them they hold, and a caller who is
   * refused learns only that they do not.
   *
   * Delete this once a real ccae_admin endpoint exists. It is scaffolding for
   * verification, not a feature.
   */
  @Get('admin_only')
  @Roles(AppRole.CcaeAdmin)
  adminOnly(@CurrentUser() user: AuthenticatedUser): {
    permitted: true;
    id: string;
  } {
    return { permitted: true, id: user.id };
  }
}
