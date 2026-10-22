import { prisma } from '../prisma';
import { UnitCoordinatorsService } from './unit-coordinators.service';

describe('UnitCoordinatorsService.findAll visibility', () => {
  afterEach(() => jest.restoreAllMocks());

  it('leaves out coordinators whose account has been deactivated', async () => {
    const query = jest.spyOn(prisma.coordinators, 'findMany');

    await new UnitCoordinatorsService().findAll();

    expect(query.mock.calls[0][0]).toMatchObject({
      where: {
        OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
      },
    });
  });

  it('leaves out coordinators with an open report, but not ones with no account', async () => {
    jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValueOnce([
      {
        entry_id: 4n,
        target_id: '7',
        detail: { reason: 'asked for money', matchId: '6001' },
        actor: null,
      },
    ] as never);
    const query = jest.spyOn(prisma.coordinators, 'findMany');

    await new UnitCoordinatorsService().findAll();

    expect(query.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] }],
      },
    });
  });
});
