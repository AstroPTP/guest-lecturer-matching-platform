import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma } from '../prisma';

describe('MessagesService', () => {
  let service: MessagesService;
  let matchRequests: MatchRequestsService;

  const userId = 'auth0|user-123';
  const sentAt = new Date('2026-10-01T02:00:00.000Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, MatchRequestsService, NotificationsService],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    matchRequests = module.get<MatchRequestsService>(MatchRequestsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findThread', () => {
    it("marks the caller's own messages as theirs", async () => {
      jest
        .spyOn(matchRequests, 'findAcceptedMatch')
        .mockResolvedValue({ side: 'guest', matchId: 6007n });
      const findMany = jest
        .spyOn(prisma.messages, 'findMany')
        .mockResolvedValue([
          {
            message_id: 1n,
            content: 'Hi',
            sent_at: sentAt,
            sent_by: 'coordinator',
          },
          {
            message_id: 2n,
            content: 'Hello',
            sent_at: sentAt,
            sent_by: 'guest',
          },
        ] as never);

      await expect(service.findThread(userId, '2005')).resolves.toEqual([
        { id: '1', text: 'Hi', sentAt: sentAt.toISOString(), fromMe: false },
        { id: '2', text: 'Hello', sentAt: sentAt.toISOString(), fromMe: true },
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { match_id: 6007n } }),
      );
    });

    it('refuses someone the caller has not matched with', async () => {
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce({ coordinator_id: 5n } as never);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6008n,
        status: 'PENDING',
      } as never);

      await expect(service.findThread(userId, '3008')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('send', () => {
    it("writes into the caller's match, recording their side", async () => {
      jest
        .spyOn(matchRequests, 'findAcceptedMatch')
        .mockResolvedValue({ side: 'coordinator', matchId: 6007n });
      const create = jest.spyOn(prisma.messages, 'create').mockResolvedValue({
        message_id: 3n,
        content: 'See you Monday',
        sent_at: sentAt,
        sent_by: 'coordinator',
      } as never);

      await expect(
        service.send(userId, '3002', 'See you Monday'),
      ).resolves.toEqual(
        expect.objectContaining({ text: 'See you Monday', fromMe: true }),
      );
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          match_id: 6007n,
          sent_by: 'coordinator',
        }) as unknown,
      });
    });
  });

  describe('while a report keeps the two apart', () => {
    /** Guest 7 (user 1 in the double) matched with coordinator 5 (user 55). */
    function matched(reports: [reporter: bigint, reported: string][]) {
      jest
        .spyOn(prisma.coordinators, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ user_id: 55n } as never);
      jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValue({ guest_id: 7n } as never);
      jest.spyOn(prisma.match_requests, 'findUnique').mockResolvedValue({
        match_id: 6007n,
        coordinator_id: 5n,
        guest_id: 7n,
        status: 'ACCEPTED',
      } as never);
      jest.spyOn(prisma.audit_entries, 'findMany').mockResolvedValueOnce(
        reports.map(([actor, target], i) => ({
          entry_id: BigInt(40 + i),
          actor_user_id: actor,
          target_id: target,
          detail: { reason: 'asked for money', matchId: '6007' },
          actor: null,
        })) as never,
      );
    }

    it('refuses a new message and writes nothing', async () => {
      matched([[55n, '1']]);
      const create = jest.spyOn(prisma.messages, 'create');

      await expect(service.send(userId, '5', 'Hello')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('refuses to open the thread', async () => {
      matched([[1n, '55']]);
      const read = jest.spyOn(prisma.messages, 'findMany');

      await expect(service.findThread(userId, '5')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(read).not.toHaveBeenCalled();
    });

    it('still delivers when only one stranger has reported the other person', async () => {
      matched([[900n, '55']]);
      jest.spyOn(prisma.messages, 'create').mockResolvedValue({
        message_id: 1n,
        content: 'Hello',
        sent_at: sentAt,
        sent_by: 'guest',
      } as never);

      await expect(service.send(userId, '5', 'Hello')).resolves.toMatchObject({
        text: 'Hello',
        fromMe: true,
      });
    });
  });

  describe('findSummaries', () => {
    it('returns the latest message for each match that has any', async () => {
      jest.spyOn(matchRequests, 'findAcceptedMatches').mockResolvedValue({
        side: 'guest',
        matches: [
          { matchId: 6007n, targetId: '2005' },
          { matchId: 6005n, targetId: '2003' },
        ],
      });
      jest.spyOn(prisma.messages, 'findMany').mockResolvedValue([
        { match_id: 6007n, content: 'Latest', sent_at: sentAt },
        { match_id: 6007n, content: 'Older', sent_at: sentAt },
      ] as never);

      await expect(service.findSummaries(userId)).resolves.toEqual([
        {
          targetId: '2005',
          lastMessage: 'Latest',
          lastSentAt: sentAt.toISOString(),
        },
      ]);
    });
  });
});
