/**
 * Injection token for the validated environment.
 *
 * AppEnv is an interface, so it erases at compile time and cannot itself be a
 * DI token — Nest would see `undefined` for the constructor parameter and fail
 * to resolve it at boot. A string token keeps the environment injectable, and
 * therefore replaceable in tests, without that trap.
 */
export const APP_ENV = 'APP_ENV';
