import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma } from '../prisma';
import { SettingsService } from './settings.service';

/**
 * Account settings talk to Auth0, so every call here goes to a fake fetch.
 * Nothing reaches a real tenant. The tests pin the protections that matter:
 * a sensitive change needs the current password of this exact account, roles
 * come only from app_metadata, administrator can never be self-selected, and
 * Auth0's own error detail never reaches the client.
 */

const ENV = {
  AUTH0_DOMAIN: 'tenant.example.auth0.com',
  AUTH0_MANAGEMENT_CLIENT_ID: 'mgmt-client',
  AUTH0_MANAGEMENT_CLIENT_SECRET: 'mgmt-secret',
  AUTH0_SETTINGS_CLIENT_ID: 'settings-client',
  AUTH0_SETTINGS_CLIENT_SECRET: 'settings-secret',
};

const ME = 'auth0|abc123';

type Call = { method: string; path: string; body: Record<string, unknown> };
type Handler = (call: Call) => { status: number; json?: unknown };

/** A fake fetch that routes by method and path and records every call. */
function fakeAuth0(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const impl = jest.fn((url: string, init: RequestInit = {}) => {
    const { pathname, search } = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
    const call = { method, path: pathname + search, body };
    calls.push(call);
    const key = Object.keys(handlers).find((pattern) => {
      const [m, p] = pattern.split(' ');
      return (
        m === method &&
        (call.path === p ||
          call.path.startsWith(p + '?') ||
          call.path.startsWith(p + '/'))
      );
    });
    const result = key ? handlers[key](call) : { status: 404 };
    const response: Partial<Response> = {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: () => Promise.resolve(result.json ?? {}),
    };
    return Promise.resolve(response);
  });
  global.fetch = impl as unknown as typeof fetch;
  return calls;
}

/** The token endpoint serves two grants; tell them apart by grant_type. */
const tokenEndpoint =
  (passwordOutcome: 'ok' | 'wrong' | 'mfa' = 'ok'): Handler =>
  ({ body }) => {
    if (body.grant_type === 'client_credentials') {
      return {
        status: 200,
        json: { access_token: 'mgmt-token', expires_in: 86400 },
      };
    }
    if (passwordOutcome === 'wrong')
      return { status: 403, json: { error: 'invalid_grant' } };
    if (passwordOutcome === 'mfa')
      return { status: 403, json: { error: 'mfa_required' } };
    return { status: 200, json: { access_token: 'user-token' } };
  };

const passwordUser = {
  user_id: ME,
  email: 'me@example.com',
  email_verified: true,
  identities: [
    {
      provider: 'auth0',
      connection: 'Username-Password-Authentication',
      user_id: 'abc123',
    },
  ],
};

const realFetch = global.fetch;
let service: SettingsService;

beforeEach(() => {
  Object.assign(process.env, ENV);
  service = new SettingsService();
});

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('configuration', () => {
  it('answers 503 rather than crashing when Auth0 is not configured', async () => {
    delete process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
    fakeAuth0({});
    await expect(service.getAccount(ME)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses a domain that is not a bare hostname', async () => {
    process.env.AUTH0_DOMAIN = 'evil.example.com/redirect?to=';
    const calls = fakeAuth0({});
    await expect(service.getAccount(ME)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(calls).toHaveLength(0);
  });

  it('reuses one Management API token across calls', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await service.getAccount(ME);
    await service.getAccount(ME);
    expect(
      calls.filter((c) => c.body.grant_type === 'client_credentials'),
    ).toHaveLength(1);
  });
});

describe('changePassword', () => {
  it('refuses a new password identical to the current one without calling Auth0', async () => {
    const calls = fakeAuth0({});
    await expect(
      service.changePassword(ME, 'Same-Pass-1', 'Same-Pass-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toHaveLength(0);
  });

  it('refuses a wrong current password and changes nothing', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint('wrong'),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(
      service.changePassword(ME, 'wrong', 'New-Pass-123'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CURRENT_PASSWORD' },
    });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('refuses a password that belongs to a different account', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
      'GET /userinfo': () => ({
        status: 200,
        json: { sub: 'auth0|someone-else' },
      }),
    });
    await expect(
      service.changePassword(ME, 'Their-Pass-1', 'New-Pass-123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('sends social sign-in accounts to their provider instead', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({
        status: 200,
        json: {
          ...passwordUser,
          identities: [
            { provider: 'google-oauth2', connection: 'google', user_id: 'g1' },
          ],
        },
      }),
    });
    await expect(
      service.changePassword(ME, 'x', 'New-Pass-123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      calls.some((c) =>
        c.body.grant_type?.toString().includes('password-realm'),
      ),
    ).toBe(false);
  });

  it('reports MFA or a different sign-in method as unavailable, not as a wrong password', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint('mfa'),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(
      service.changePassword(ME, 'right', 'New-Pass-123'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('changes the password on the right connection once verified', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
      'GET /userinfo': () => ({ status: 200, json: { sub: ME } }),
      'PATCH /api/v2/users': () => ({ status: 200, json: {} }),
    });
    await expect(
      service.changePassword(ME, 'Old-Pass-1', 'New-Pass-123'),
    ).resolves.toEqual({ success: true });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      password: 'New-Pass-123',
      connection: 'Username-Password-Authentication',
    });
  });
});

describe('Auth0 errors', () => {
  it('turns an Auth0 validation error into a generic 400 without its detail', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({
        status: 400,
        json: { message: 'internal detail from Auth0' },
      }),
    });
    const error = await service.getAccount(ME).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).not.toContain('internal detail');
  });

  it('turns rate limiting and outages into 503', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({ status: 429 }),
    });
    await expect(service.getAccount(ME)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('completeRegistration', () => {
  it('requires the email to be verified first', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users': () => ({
        status: 200,
        json: { ...passwordUser, email_verified: false },
      }),
    });
    await expect(
      service.completeRegistration(ME, 'guest', 'Me', 'Pass-1234'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an email that already has a password account', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [passwordUser],
      }),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(
      service.completeRegistration(ME, 'guest', 'Me', 'Pass-1234'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['guest', 'guest_speaker'],
    ['coordinator', 'unit_coordinator'],
  ] as const)(
    'creates a %s account with exactly the %s role',
    async (choice, role) => {
      const calls = fakeAuth0({
        'POST /oauth/token': tokenEndpoint(),
        'GET /api/v2/users-by-email': () => ({ status: 200, json: [] }),
        'GET /api/v2/users': () => ({
          status: 200,
          json: { ...passwordUser, identities: [] },
        }),
        'POST /api/v2/users': () => ({ status: 201, json: {} }),
      });
      await service.completeRegistration(ME, choice, 'Me', 'Pass-1234');
      const created = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/v2/users',
      );
      expect(created?.body.app_metadata).toEqual({ roles: [role] });
    },
  );
});

describe('syncRoles', () => {
  const socialWith = (roles: string[]) => ({
    user_id: 'email|1',
    email: 'me@example.com',
    email_verified: true,
    identities: [{ provider: 'email', connection: 'email', user_id: '1' }],
    app_metadata: { roles },
  });

  it('never carries the administrator role across accounts', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [socialWith(['ccae_admin'])],
      }),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(service.syncRoles(ME)).resolves.toEqual({ changed: false });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('ignores roles a user could have written themselves in user_metadata', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [
          { ...socialWith([]), user_metadata: { roles: ['unit_coordinator'] } },
        ],
      }),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(service.syncRoles(ME)).resolves.toEqual({ changed: false });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('does not guess when the other sign-ins hold two different roles', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [socialWith(['guest_speaker']), socialWith(['unit_coordinator'])],
      }),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
    });
    await expect(service.syncRoles(ME)).resolves.toEqual({ changed: false });
  });

  it('carries a single self-selectable role to the password account', async () => {
    const calls = fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [socialWith(['unit_coordinator'])],
      }),
      'GET /api/v2/users': () => ({ status: 200, json: passwordUser }),
      'PATCH /api/v2/users': () => ({ status: 200, json: {} }),
    });
    await expect(service.syncRoles(ME)).resolves.toEqual({ changed: true });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      app_metadata: { roles: ['unit_coordinator'] },
    });
  });
});

describe('isRegistered', () => {
  it('counts only password accounts that hold a role', async () => {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'GET /api/v2/users-by-email': () => ({
        status: 200,
        json: [{ ...passwordUser, app_metadata: { roles: [] } }],
      }),
    });
    await expect(service.isRegistered('me@example.com')).resolves.toEqual({
      exists: false,
    });
  });
});

describe('deleteAccount', () => {
  /** Every call the transaction makes, in order, as "table.method". */
  type Tx = ReturnType<typeof deletionTransaction>;

  function deletionTransaction(
    photos: {
      guest?: bigint | null;
      coordinator?: bigint | null;
    },
    /** attachment_id of each support message in the caller's threads. */
    supportFiles: (bigint | null)[] = [],
  ) {
    const order: string[] = [];
    const record = (name: string) => {
      order.push(name);
      return Promise.resolve({ count: 1 });
    };
    const profile = (name: string, photo: bigint | null | undefined) => ({
      findUnique: jest.fn(() => {
        order.push(`${name}.findUnique`);
        return Promise.resolve(
          photo === undefined ? null : { profile_image_id: photo },
        );
      }),
      deleteMany: jest.fn(() => record(`${name}.deleteMany`)),
    });
    return {
      order,
      availability: { deleteMany: jest.fn(() => record('availability')) },
      user_expertise: { deleteMany: jest.fn(() => record('user_expertise')) },
      notifications: { deleteMany: jest.fn(() => record('notifications')) },
      push_subscriptions: {
        deleteMany: jest.fn(() => record('push_subscriptions')),
      },
      support_messages: {
        findMany: jest.fn(() => {
          order.push('support_messages.findMany');
          return Promise.resolve(
            supportFiles.map((attachment_id) => ({ attachment_id })),
          );
        }),
        deleteMany: jest.fn(() => record('support_messages.deleteMany')),
      },
      support_threads: {
        deleteMany: jest.fn(() => record('support_threads')),
      },
      support_attachments: {
        deleteMany: jest.fn(() => record('support_attachments')),
      },
      images: { deleteMany: jest.fn(() => record('images')) },
      guests: profile('guests', photos.guest),
      coordinators: profile('coordinators', photos.coordinator),
      users: { update: jest.fn(() => record('users')) },
    };
  }

  /** Deletes ME with Auth0 already gone, running the work against `tx`. */
  async function deleteWith(tx: Tx) {
    fakeAuth0({
      'POST /oauth/token': tokenEndpoint(),
      'DELETE /api/v2/users': () => ({ status: 404 }),
    });
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementation(((work: (t: Tx) => Promise<void>) =>
        work(tx)) as never);
    return service.deleteAccount(ME);
  }

  it('clears personal data and marks the user deleted, even if Auth0 already removed them', async () => {
    const tx = deletionTransaction({});

    await expect(deleteWith(tx)).resolves.toEqual({ success: true });

    const written = (
      tx.users.update.mock.calls as unknown as [
        { data: Record<string, unknown> },
      ][]
    )[0][0].data;
    expect(written).toMatchObject({
      email: null,
      role: null,
      consentstate: false,
    });
    expect(written.deletedat).toBeInstanceOf(Date);
  });

  it("removes the caller's notifications, which hold their activity and links", async () => {
    const tx = deletionTransaction({});

    await deleteWith(tx);

    expect(tx.notifications.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
    });
  });

  it("removes the caller's devices set up for pushed notifications", async () => {
    const tx = deletionTransaction({});

    await deleteWith(tx);

    expect(tx.push_subscriptions.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
    });
  });

  it('removes the devices inside the deletion transaction, before the user row is blanked', async () => {
    const tx = deletionTransaction({});
    const outside = jest.spyOn(prisma.push_subscriptions, 'deleteMany');

    await deleteWith(tx);

    // On the transaction's own client, so it commits or rolls back with the
    // rest of the deletion, and never on a separate connection.
    expect(tx.push_subscriptions.deleteMany).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    expect(tx.order.indexOf('push_subscriptions')).toBeGreaterThanOrEqual(0);
    expect(tx.order.indexOf('push_subscriptions')).toBeLessThan(
      tx.order.indexOf('users'),
    );
  });

  it('removes the requests for details sent to the caller, with their messages', async () => {
    const tx = deletionTransaction({});

    await deleteWith(tx);

    expect(tx.support_messages.deleteMany).toHaveBeenCalledWith({
      where: { thread: { user_id: 1n } },
    });
    expect(tx.support_threads.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 1n },
    });
  });

  it('removes the files attached to those messages, after the messages that point at them', async () => {
    const tx = deletionTransaction({}, [21n, null, 22n]);

    await deleteWith(tx);

    expect(tx.support_messages.findMany).toHaveBeenCalledWith({
      where: { thread: { user_id: 1n }, attachment_id: { not: null } },
      select: { attachment_id: true },
    });
    // Only a file nothing else refers to is deleted.
    expect(tx.support_attachments.deleteMany).toHaveBeenCalledWith({
      where: { attachment_id: { in: [21n, 22n] }, messages: { none: {} } },
    });
    const at = (call: string) => tx.order.indexOf(call);
    expect(at('support_messages.findMany')).toBeLessThan(
      at('support_messages.deleteMany'),
    );
    expect(at('support_messages.deleteMany')).toBeLessThan(
      at('support_attachments'),
    );
  });

  it('deletes no files for a caller whose messages had none', async () => {
    const tx = deletionTransaction({}, [null, null]);

    await deleteWith(tx);

    expect(tx.support_attachments.deleteMany).not.toHaveBeenCalled();
    expect(tx.support_threads.deleteMany).toHaveBeenCalled();
  });

  it('does all of it in the one transaction, before the users row is marked deleted', async () => {
    const tx = deletionTransaction({ guest: 11n }, [21n]);
    const transaction = jest.spyOn(prisma, '$transaction');

    await deleteWith(tx);

    expect(transaction).toHaveBeenCalledTimes(1);

    // Every call above went through the transaction's client (the root client
    // has no support tables in the test double, so a stray call would throw).
    const at = (call: string) => tx.order.indexOf(call);
    expect(at('support_threads')).toBeGreaterThanOrEqual(0);
    expect(at('support_attachments')).toBeGreaterThanOrEqual(0);
    expect(at('support_threads')).toBeLessThan(at('users'));
    expect(at('support_attachments')).toBeLessThan(at('users'));
  });

  it('removes the guest lecturer photo along with the profile', async () => {
    const tx = deletionTransaction({ guest: 11n });

    await deleteWith(tx);

    expect(tx.images.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.images.deleteMany).toHaveBeenCalledWith({
      where: { image_id: { in: [11n] } },
    });
  });

  it('removes the coordinator photo along with the profile', async () => {
    const tx = deletionTransaction({ coordinator: 12n });

    await deleteWith(tx);

    expect(tx.images.deleteMany).toHaveBeenCalledWith({
      where: { image_id: { in: [12n] } },
    });
  });

  it('removes both photos when the account holds both profiles', async () => {
    const tx = deletionTransaction({ guest: 11n, coordinator: 12n });

    await deleteWith(tx);

    expect(tx.images.deleteMany).toHaveBeenCalledWith({
      where: { image_id: { in: [11n, 12n] } },
    });
  });

  it('deletes no images for an account that never added a photo', async () => {
    const tx = deletionTransaction({ guest: null, coordinator: undefined });

    await deleteWith(tx);

    expect(tx.images.deleteMany).not.toHaveBeenCalled();
    expect(tx.guests.deleteMany).toHaveBeenCalled();
  });

  it('reads the photo ids before the profiles that point at them are deleted', async () => {
    const tx = deletionTransaction({ guest: 11n, coordinator: 12n });

    await deleteWith(tx);

    const at = (call: string) => tx.order.indexOf(call);
    expect(at('guests.findUnique')).toBeGreaterThanOrEqual(0);
    expect(at('guests.findUnique')).toBeLessThan(at('guests.deleteMany'));
    expect(at('coordinators.findUnique')).toBeGreaterThanOrEqual(0);
    expect(at('coordinators.findUnique')).toBeLessThan(
      at('coordinators.deleteMany'),
    );
  });

  it('keeps the users row, so the signed token can no longer be used', async () => {
    const tx = deletionTransaction({ guest: 11n });

    await deleteWith(tx);

    expect(tx.users.update).toHaveBeenCalledTimes(1);
    expect(tx.order.at(-1)).toBe('users');
  });
});
