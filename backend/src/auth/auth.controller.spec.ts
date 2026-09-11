import { AuthController } from './auth.controller';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AppRole } from './roles';
import { ROLES_KEY } from './roles.decorator';

/**
 * These assert the decorators rather than the behaviour, and that is
 * deliberate.
 *
 * RolesGuard itself is covered thoroughly in auth.guards.spec.ts against a
 * purpose-built harness. What no behavioural test can catch is somebody
 * removing @Roles() from a route here: the handler still returns 200, every
 * existing test still passes, and the route silently opens to any
 * authenticated caller. That is the regression worth a test, and the decorator
 * metadata is the only place it is visible.
 */

/**
 * The route handler as a plain function, which is where Nest's SetMetadata
 * actually stores its metadata.
 *
 * Reached through the property descriptor rather than as `Class.prototype.name`
 * because the latter is an unbound method reference and eslint rejects it,
 * fairly, since it is a real hazard anywhere `this` matters. Throwing on a
 * missing name is a bonus: rename or delete a route and this fails loudly
 * instead of quietly asserting on `undefined`.
 */
function handlerNamed(name: 'whoami' | 'adminOnly'): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    name,
  );
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`AuthController no longer has a ${name} handler`);
  }
  return descriptor.value as object;
}

describe('AuthController route protection', () => {
  it('admin_only requires the ccae_admin role', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handlerNamed('adminOnly')) as
      | string[]
      | undefined;

    expect(roles).toEqual([AppRole.CcaeAdmin]);
  });

  it('neither route is marked public', () => {
    for (const name of ['whoami', 'adminOnly'] as const) {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, handlerNamed(name)),
      ).toBeUndefined();
    }
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController)).toBeUndefined();
  });

  it('whoami carries no role requirement, so any verified caller may read it', () => {
    // Not an oversight. whoami answers "who does the backend think you are",
    // which is only ever the caller's own token echoed back to them.
    expect(
      Reflect.getMetadata(ROLES_KEY, handlerNamed('whoami')),
    ).toBeUndefined();
  });
});
