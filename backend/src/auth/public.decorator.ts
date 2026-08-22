import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a token.
 *
 * Authentication is on by default — JwtAuthGuard is registered globally, so a
 * new route is protected unless somebody deliberately opts out. Forgetting to
 * add a guard then leaves a route closed rather than open, which is the safe
 * direction to be wrong in (checklist EOP-09).
 *
 * Every use of this needs to correspond to a `Public? = Yes` row in the RBAC
 * Matrix.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
