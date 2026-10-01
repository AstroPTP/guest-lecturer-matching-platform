import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DismissalsService } from './dismissals.service';
import { prisma } from '../prisma';

describe('DismissalsService', () => {
  let service: DismissalsService;

  // Auth0 subject; the double's resolveUserId maps every subject to 1n.
  const userId = 'auth0|user-123';
  const dismissedAt = new Date('2026-09-30T02:00:00.000Z');

  function signInAsCoordinator(coordinatorId: bigint) {
    jest
      .spyOn(prisma.coordinators, 'findUnique')
      .mockResolvedValueOnce({ coordinator_id: coordinatorId } as never);
  }

  function signInAsGuest(guestId: bigint) {
    jest.spyOn(prisma.coordinators, 'findUnique').mockResolvedValueOnce(null);
    jest
      .spyOn(prisma.guests, 'findUnique')
      .mockResolvedValueOnce({ guest_id: guestId } as never);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DismissalsService],
    }).compile();

    service = module.get<DismissalsService>(DismissalsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('refuses a caller with no coordinator or guest profile', async () => {
    await expect(service.findMine(userId)).rejects.toThrow(ForbiddenException);
  });

  describe('findMine', () => {
    it("returns a coordinator's dismissed guests as string ids", async () => {
      signInAsCoordinator(5n);
      const findMany = jest
        .spyOn(prisma.dismissals, 'findMany')
        .mockResolvedValue([
          { coordinator_id: 5n, guest_id: 3001n, created_at: dismissedAt },
        ] as never);

      await expect(service.findMine(userId)).resolves.toEqual([
        { targetId: '3001', dismissedAt: dismissedAt.toISOString() },
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dismissed_by: 'coordinator', coordinator_id: 5n },
        }),
      );
    });

    it("returns a guest's dismissed coordinators as string ids", async () => {
      signInAsGuest(7n);
      const findMany = jest
        .spyOn(prisma.dismissals, 'findMany')
        .mockResolvedValue([
          { coordinator_id: 2001n, guest_id: 7n, created_at: dismissedAt },
        ] as never);

      await expect(service.findMine(userId)).resolves.toEqual([
        { targetId: '2001', dismissedAt: dismissedAt.toISOString() },
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dismissed_by: 'guest', guest_id: 7n },
        }),
      );
    });
  });

  describe('dismiss', () => {
    it('stores the pair with the guest as the one dismissing', async () => {
      signInAsGuest(7n);
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 2001n } as never);
      const upsert = jest
        .spyOn(prisma.dismissals, 'upsert')
        .mockResolvedValue({ created_at: dismissedAt } as never);

      await expect(service.dismiss(userId, '2001')).resolves.toEqual({
        targetId: '2001',
        dismissedAt: dismissedAt.toISOString(),
      });
      const pair = {
        coordinator_id: 2001n,
        guest_id: 7n,
        dismissed_by: 'guest',
      };
      expect(upsert).toHaveBeenCalledWith({
        where: { coordinator_id_guest_id_dismissed_by: pair },
        update: {},
        create: pair,
      });
    });

    it('rejects a profile that does not exist', async () => {
      signInAsCoordinator(5n);
      const upsert = jest.spyOn(prisma.dismissals, 'upsert');

      await expect(service.dismiss(userId, '9999')).rejects.toThrow(
        NotFoundException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects an id that is not numeric, rather than failing mid-write', async () => {
      signInAsCoordinator(5n);

      await expect(service.dismiss(userId, 'abc')).rejects.toThrow('targetId');
    });
  });

  describe('remove', () => {
    it("deletes only the caller's own dismissal of that profile", async () => {
      signInAsCoordinator(5n);
      const deleteMany = jest.spyOn(prisma.dismissals, 'deleteMany');

      await service.remove(userId, '3001');

      expect(deleteMany).toHaveBeenCalledWith({
        where: {
          coordinator_id: 5n,
          guest_id: 3001n,
          dismissed_by: 'coordinator',
        },
      });
    });
  });
});
