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
});
