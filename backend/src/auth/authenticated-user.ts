import { AppRole } from './roles';

/**
 * What the guards attach to `request.user` once a token has been verified.
 *
 * Every field here comes out of a token whose RS256 signature was checked
 * against the identity provider's published keys. Nothing on this object was
 * supplied directly by the caller.
 */
export interface AuthenticatedUser {
  /** The `sub` claim, the Auth0 user id, e.g. `auth0|65f1a`. */
  id: string;
  email?: string;
  /**
   * Roles from the namespaced Auth0 claim, filtered to values this
   * application recognises. Empty when the claim is absent, see JwtStrategy
   * for why that is never treated as "all roles".
   */
  roles: AppRole[];
}
