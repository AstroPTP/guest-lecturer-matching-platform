import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';
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

  describe('after reports', () => {
    /** Open reports as [reporter, reported] pairs; the double's viewer is user 1. */
    function reports(pairs: [reporter: bigint, reported: string][]) {
      stubOpenReports(
        pairs.map(([actor, target], i) => ({
          entry_id: BigInt(40 + i),
          actor_user_id: actor,
          target_id: target,
          detail: { reason: 'asked for money', matchId: '6001' },
        })),
      );
    }

    async function filterSeenBy(viewer: string) {
      const query = jest.spyOn(prisma.coordinators, 'findMany');
      await new UnitCoordinatorsService().findAll(viewer);
      return query.mock.calls[0][0];
    }

    it('leaves out a coordinator the viewer has reported, but not ones with no account', async () => {
      reports([[1n, '7']]);

      expect(await filterSeenBy('auth0|viewer')).toMatchObject({
        where: {
          AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] }],
        },
      });
    });

    it('leaves out a coordinator who reported the viewer', async () => {
      reports([[7n, '1']]);

      expect(await filterSeenBy('auth0|viewer')).toMatchObject({
        where: {
          AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] }],
        },
      });
    });

    it('keeps a coordinator in for everyone else when only one person reported them', async () => {
      reports([[8n, '7']]);

      expect(await filterSeenBy('auth0|viewer')).toMatchObject({
        where: {
          AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [] } }] }],
        },
      });
    });

    it('leaves a coordinator out for everyone once two different people reported them', async () => {
      reports([
        [8n, '7'],
        [9n, '7'],
      ]);

      expect(await filterSeenBy('auth0|viewer')).toMatchObject({
        where: {
          AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] }],
        },
      });
    });

    describe('listing the viewer’s own matches', () => {
      async function matchesOfViewer() {
        const query = jest.spyOn(prisma.coordinators, 'findMany');
        await new UnitCoordinatorsService().findAll(
          'auth0|viewer',
          undefined,
          true,
        );
        return query.mock.calls[0][0];
      }

      it('keeps a coordinator the viewer has reported, so their conversation stays', async () => {
        reports([[1n, '7']]);

        expect(await matchesOfViewer()).toMatchObject({
          where: {
            AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [] } }] }],
          },
        });
      });

      it('keeps a coordinator who reported the viewer', async () => {
        reports([[7n, '1']]);

        expect(await matchesOfViewer()).toMatchObject({
          where: {
            AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [] } }] }],
          },
        });
      });

      it('still leaves out a coordinator who is on hold for everyone', async () => {
        reports([
          [8n, '7'],
          [9n, '7'],
        ]);

        expect(await matchesOfViewer()).toMatchObject({
          where: {
            AND: [{ OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] }],
          },
        });
      });
    });
  });
});
