/**
 * The three application roles.
 *
 * These strings are the contract between the identity provider and this
 * backend: they are the values stored in each Auth0 user's `app_metadata`,
 * which the Post-Login Action copies into the namespaced roles claim, and
 * which @Roles() is checked against. Changing a value here without changing
 * the Action silently denies access to everybody holding the old value, so
 * treat them as fixed.
 */
export const AppRole = {
  GuestSpeaker: 'guest_speaker',
  UnitCoordinator: 'unit_coordinator',
  CcaeAdmin: 'ccae_admin',
} as const;

export type AppRole = (typeof AppRole)[keyof typeof AppRole];

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.values(AppRole));

/**
 * Narrows an untrusted string to a known role.
 *
 * Anything unrecognised is discarded rather than passed through. A role we do
 * not know cannot match an @Roles() requirement, but letting it into the list
 * would mean an unexpected value from the Action shows up in logs and audit
 * records as though it were real.
 */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && KNOWN_ROLES.has(value);
}
