import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';
import { AppRole, isAppRole } from './roles';

/**
 * A simulated signed-in user, for testing the application without a login.
 *
 * The team needs to exercise the frontend against the backend while the real
 * login is still being wired, and waiting on authentication to test everything
 * else is not a good trade this close to the deadline.
 *
 * Three things keep this from becoming an authentication bypass in anything
 * that matters:
 *
 *   1. It is off unless DEMO_AUTH_BYPASS is exactly "true".
 *   2. It refuses to engage when NODE_ENV is production, whatever the flag
 *      says. That check is not configurable.
 *   3. It attaches a user rather than skipping the guards, so RolesGuard still
 *      runs and a route requiring a role it does not hold still refuses. What
 *      is being tested is still the real authorisation path.
 *
 * Delete this file once the login flow is wired. It exists to be temporary.
 */

/** Whether the bypass may run at all. */
export function demoBypassEnabled(): boolean {
  return (
    process.env.DEMO_AUTH_BYPASS === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * The simulated user.
 *
 * The role comes from DEMO_AUTH_ROLE so a tester can switch dashboards without
 * a code change. An unrecognised value falls back to unit_coordinator rather
 * than granting everything, because a typo should not hand out an
 * administrator session.
 */
export function demoUser(): AuthenticatedUser {
  const requested = process.env.DEMO_AUTH_ROLE;
  const role = isAppRole(requested) ? requested : AppRole.UnitCoordinator;

  return {
    id: `demo|${role}`,
    email: `${role}@demo.local`,
    name: 'Demo User',
    roles: [role],
  };
}

/** Attaches the simulated user to the request, as the real strategy would. */
export function attachDemoUser(request: Request): void {
  (request as Request & { user: AuthenticatedUser }).user = demoUser();
}
