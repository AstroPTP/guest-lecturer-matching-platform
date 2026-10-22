import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';

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
      stubOpenReports(
        reports.map(([actor, target], i) => ({
          entry_id: BigInt(40 + i),
          actor_user_id: actor,
          target_id: target,
          detail: { reason: 'asked for money', matchId: '6007' },
        })),
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
      jest.spyOn(matchRequests, 'findUnpausedMatches').mockResolvedValue({
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

    it('asks only for conversations that are not paused', async () => {
      const accepted = jest.spyOn(matchRequests, 'findAcceptedMatches');
      jest
        .spyOn(matchRequests, 'findUnpausedMatches')
        .mockResolvedValue({ side: 'guest', matches: [] });

      await expect(service.findSummaries(userId)).resolves.toEqual([]);
      expect(accepted).not.toHaveBeenCalled();
    });

    describe('while a report keeps two people apart', () => {
      /** Guest 7 (user 1 in the double) matched with coordinators 5 (user 55) and 6 (user 56). */
      function matchedWithTwo(reports: [reporter: bigint, reported: string][]) {
        jest
          .spyOn(prisma.coordinators, 'findUnique')
          .mockResolvedValueOnce(null);
        jest
          .spyOn(prisma.guests, 'findUnique')
          .mockResolvedValue({ guest_id: 7n } as never);
        jest.spyOn(prisma.match_requests, 'findMany').mockResolvedValue(
          [5n, 6n].map((coordinator_id) => ({
            match_id: 6000n + coordinator_id,
            coordinator_id,
            guest_id: 7n,
            status: 'ACCEPTED',
          })) as never,
        );
        jest.spyOn(prisma.coordinators, 'findMany').mockResolvedValue([
          { coordinator_id: 5n, user_id: 55n },
          { coordinator_id: 6n, user_id: 56n },
        ] as never);
        const messages = jest
          .spyOn(prisma.messages, 'findMany')
          .mockResolvedValue(
            [6005n, 6006n].map((match_id) => ({
              match_id,
              content: `Hello ${match_id}`,
              sent_at: sentAt,
            })) as never,
          );
        stubOpenReports(
          reports.map(([actor, target], i) => ({
            entry_id: BigInt(40 + i),
            actor_user_id: actor,
            target_id: target,
            detail: { reason: 'asked for money', matchId: '6005' },
          })),
        );
        return messages;
      }
      const listed = async () =>
        (await service.findSummaries(userId)).map((c) => c.targetId);

      it('lists both threads when nobody has been reported', async () => {
        matchedWithTwo([]);

        await expect(listed()).resolves.toEqual(['5', '6']);
      });

      it('leaves out the thread with the person the caller reported', async () => {
        matchedWithTwo([[1n, '55']]);

        await expect(listed()).resolves.toEqual(['6']);
      });

      it('leaves out the thread with the person who reported the caller', async () => {
        matchedWithTwo([[55n, '1']]);

        await expect(listed()).resolves.toEqual(['6']);
      });

      it('leaves out the thread with a person held for everybody', async () => {
        matchedWithTwo([
          [900n, '56'],
          [901n, '56'],
        ]);

        await expect(listed()).resolves.toEqual(['5']);
      });

      it('lists nothing for a caller who is held', async () => {
        matchedWithTwo([
          [900n, '1'],
          [901n, '1'],
        ]);

        await expect(listed()).resolves.toEqual([]);
      });

      it('does not read the messages of a paused thread', async () => {
        const messages = matchedWithTwo([[1n, '55']]);

        await listed();

        expect(messages).toHaveBeenCalledWith(
          expect.objectContaining({ where: { match_id: { in: [6006n] } } }),
        );
      });
    });
  });
});
