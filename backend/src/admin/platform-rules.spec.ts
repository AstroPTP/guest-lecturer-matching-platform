import { prisma } from '../prisma';
import { runInRequestContext } from '../common/request-context';
import { readSettings, recordAudit } from './platform-rules';

/** The first argument of the spy's first call. */
function firstArg(spy: jest.SpyInstance): unknown {
  return (spy.mock.calls as unknown[][])[0][0];
}

/** The `detail` the audit row was created with, or undefined. */
function createdDetail(create: jest.SpyInstance): unknown {
  const [args] = create.mock.calls[0] as [{ data: { detail?: unknown } }];
  return args.data.detail;
}

describe('readSettings', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns an existing row without writing anything', async () => {
    const row = { id: 1, contact_limit_days: 90 };
    jest
      .spyOn(prisma.admin_settings, 'findUnique')
      .mockResolvedValue(row as never);
    const upsert = jest.spyOn(prisma.admin_settings, 'upsert');

    await expect(readSettings()).resolves.toBe(row);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates the row, as an upsert, only when it is missing', async () => {
    jest.spyOn(prisma.admin_settings, 'findUnique').mockResolvedValue(null);
    const created = { id: 1, contact_limit_days: 90 };
    const upsert = jest
      .spyOn(prisma.admin_settings, 'upsert')
      .mockResolvedValue(created as never);

    await expect(readSettings()).resolves.toBe(created);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  });
});

describe('recordAudit', () => {
  let create: jest.SpyInstance;

  beforeEach(() => {
    create = jest.spyOn(prisma.audit_entries, 'create');
    jest
      .spyOn(prisma.users, 'findFirst')
      .mockResolvedValue({ userid: 5n } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const inRequest = <T>(work: () => Promise<T>) =>
    runInRequestContext({ correlationId: '01HZX3K9QJ0000000000000000' }, work);

  it('adds the request correlation id to the detail', async () => {
    await inRequest(() =>
      recordAudit('auth0|a', 'user.deactivated', { type: 'user', id: '9' }),
    );

    expect(createdDetail(create)).toEqual({
      correlationId: '01HZX3K9QJ0000000000000000',
    });
  });

  it('merges the id into the detail the caller gave, keeping every caller key', async () => {
    await inRequest(() =>
      recordAudit(
        'auth0|a',
        'settings.updated',
        { type: 'settings' },
        { contact_limit_days: { from: 7, to: 14 } },
      ),
    );

    expect(createdDetail(create)).toEqual({
      correlationId: '01HZX3K9QJ0000000000000000',
      contact_limit_days: { from: 7, to: 14 },
    });
  });

  it('never overwrites a correlationId the caller set', async () => {
    await inRequest(() =>
      recordAudit('auth0|a', 'x', {}, { correlationId: 'set-by-caller', n: 1 }),
    );

    expect(createdDetail(create)).toEqual({
      correlationId: 'set-by-caller',
      n: 1,
    });
  });

  it('keeps a detail that is not an object whole, under value, beside the id', async () => {
    await inRequest(() => recordAudit('auth0|a', 'x', {}, ['a', 'b']));

    expect(createdDetail(create)).toEqual({
      correlationId: '01HZX3K9QJ0000000000000000',
      value: ['a', 'b'],
    });
  });

  it('leaves the detail exactly as given outside a request', async () => {
    await recordAudit(
      'auth0|a',
      'retention.purge',
      { type: 'messages' },
      { deleted: 3 },
    );

    expect(createdDetail(create)).toEqual({ deleted: 3 });
  });

  it('writes no detail at all outside a request when the caller gave none', async () => {
    await recordAudit(null, 'retention.purge', { type: 'messages' });

    expect(createdDetail(create)).toBeUndefined();
  });

  it('reads the id of the request it was called in, not of one running beside it', async () => {
    await Promise.all([
      runInRequestContext({ correlationId: 'req-a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await recordAudit('auth0|a', 'x', {});
      }),
      runInRequestContext({ correlationId: 'req-b' }, () =>
        recordAudit('auth0|a', 'y', {}),
      ),
    ]);

    const written = create.mock.calls.map(
      ([args]: [{ data: { action: string; detail: unknown } }]) => [
        args.data.action,
        args.data.detail,
      ],
    );
    expect(written).toEqual(
      expect.arrayContaining([
        ['x', { correlationId: 'req-a' }],
        ['y', { correlationId: 'req-b' }],
      ]),
    );
  });

  it('still writes the actor, action and target as before', async () => {
    await inRequest(() =>
      recordAudit('auth0|a', 'user.deactivated', { type: 'user', id: '9' }),
    );

    expect(firstArg(create)).toMatchObject({
      data: {
        actor_user_id: 5n,
        action: 'user.deactivated',
        target_type: 'user',
        target_id: '9',
      },
    });
  });
});
