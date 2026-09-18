import { AppRole } from './roles';
import { demoBypassEnabled, demoUser } from './demo-user';

/**
 * The third test is the one that matters. A demonstration convenience that
 * could switch itself on in production would be an authentication bypass, so
 * the production check is asserted explicitly rather than assumed from reading
 * the code.
 */
describe('the demo bypass', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('is off when the flag is unset', () => {
    delete process.env.DEMO_AUTH_BYPASS;
    process.env.NODE_ENV = 'development';
    expect(demoBypassEnabled()).toBe(false);
  });

  it('is off for any value other than the exact string true', () => {
    process.env.NODE_ENV = 'development';
    for (const value of ['1', 'yes', 'TRUE', 'true ', '']) {
      process.env.DEMO_AUTH_BYPASS = value;
      expect(demoBypassEnabled()).toBe(false);
    }
  });

  it('refuses to engage in production even when the flag is set', () => {
    process.env.DEMO_AUTH_BYPASS = 'true';
    process.env.NODE_ENV = 'production';
    expect(demoBypassEnabled()).toBe(false);
  });

  it('is on when the flag is true outside production', () => {
    process.env.DEMO_AUTH_BYPASS = 'true';
    process.env.NODE_ENV = 'development';
    expect(demoBypassEnabled()).toBe(true);
  });

  it('carries the requested role', () => {
    process.env.DEMO_AUTH_ROLE = AppRole.CcaeAdmin;
    expect(demoUser().roles).toEqual([AppRole.CcaeAdmin]);
  });

  it('falls back to unit_coordinator rather than granting an unknown role', () => {
    process.env.DEMO_AUTH_ROLE = 'root';
    expect(demoUser().roles).toEqual([AppRole.UnitCoordinator]);
  });
});
