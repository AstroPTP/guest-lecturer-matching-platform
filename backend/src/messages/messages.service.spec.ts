import { ForbiddenException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { prisma } from '../prisma';

describe('MessagesService', () => {
  let service: MessagesService;
  let matchRequests: MatchRequestsService;
  let notifications: NotificationsService;

  const userId = 'auth0|user-123';
  const sentAt = new Date('2026-10-01T02:00:00.000Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, MatchRequestsService, NotificationsService],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    matchRequests = module.get<MatchRequestsService>(MatchRequestsService);
    notifications = module.get<NotificationsService>(NotificationsService);
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

  describe('telling the recipient about a new message', () => {
    const person = (first: string, last: string, auth0Id: string | null) => ({
      first_name: first,
      last_name: last,
      role: 'Lecturer',
      users: auth0Id ? { auth0Id } : null,
    });
    const matchRow = (overrides: object = {}) =>
      ({
        coordinator_id: 5n,
        guest_id: 7n,
        coordinator: person('Ada', 'Lee', 'auth0|coordinator'),
        guest: person('Sam', 'Tran', 'auth0|guest'),
        ...overrides,
      }) as never;
    const savedRow = {
      message_id: 3n,
      content: 'See you Monday',
      sent_at: sentAt,
      sent_by: 'coordinator',
    } as never;

    function sendAs(side: 'coordinator' | 'guest', match = matchRow()) {
      jest
        .spyOn(matchRequests, 'findAcceptedMatch')
        .mockResolvedValue({ side, matchId: 6007n });
      const save = jest
        .spyOn(prisma.messages, 'create')
        .mockResolvedValue(savedRow);
      const lookup = jest
        .spyOn(prisma.match_requests, 'findUnique')
        .mockResolvedValue(match);
      return { save, lookup };
    }

    /** A stand-in for the notifications table inside the lock's transaction. */
    function unreadNotices() {
      const unread = new Set<string>();
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        notifications: {
          updateMany: jest.fn(({ where }: { where: { href: string } }) =>
            Promise.resolve({ count: unread.has(where.href) ? 1 : 0 }),
          ),
          create: jest.fn(({ data }: { data: { href: string } }) => {
            unread.add(data.href);
            return Promise.resolve({});
          }),
        },
      };
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(((run: (client: typeof tx) => Promise<unknown>) =>
          run(tx)) as never);
      return tx;
    }

    it('tells the guest when the coordinator writes, and only the guest, after the message is saved', async () => {
      const { save } = sendAs('coordinator');
      const notify = jest
        .spyOn(notifications, 'createOrRefreshUnread')
        .mockResolvedValue();

      await service.send(userId, '7', 'See you Monday');
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith({
        recipientId: 'auth0|guest',
        type: 'message',
        title: 'New message',
        description: 'Ada Lee sent you a message',
        actionLabel: 'Reply',
        href: '/guest_lecturer/messages?with=5',
      });
      expect(save.mock.invocationCallOrder[0]).toBeLessThan(
        notify.mock.invocationCallOrder[0],
      );
    });

    it('tells the coordinator when the guest writes, and only the coordinator', async () => {
      sendAs('guest');
      const notify = jest
        .spyOn(notifications, 'createOrRefreshUnread')
        .mockResolvedValue();

      await service.send(userId, '5', 'Happy to help');
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith({
        recipientId: 'auth0|coordinator',
        type: 'message',
        title: 'New message',
        description: 'Sam Tran sent you a message',
        actionLabel: 'Reply',
        href: '/unit_coordinator/messages?with=7',
      });
    });

    it('sends nothing when the caller is refused because they have not matched', async () => {
      jest
        .spyOn(matchRequests, 'findAcceptedMatch')
        .mockRejectedValue(new ForbiddenException('not matched'));
      const save = jest.spyOn(prisma.messages, 'create');
      const notify = jest.spyOn(notifications, 'createOrRefreshUnread');

      await expect(service.send(userId, '7', 'Hello')).rejects.toThrow(
        ForbiddenException,
      );
      expect(save).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('sends nothing when the message could not be saved', async () => {
      const { save } = sendAs('coordinator');
      save.mockRejectedValue(new Error('connection lost'));
      const notify = jest.spyOn(notifications, 'createOrRefreshUnread');

      await expect(service.send(userId, '7', 'Hello')).rejects.toThrow(
        'connection lost',
      );
      expect(notify).not.toHaveBeenCalled();
    });

    it('sends nothing when the other person has no account to notify', async () => {
      sendAs('coordinator', matchRow({ guest: person('Sam', 'Tran', null) }));
      const notify = jest.spyOn(notifications, 'createOrRefreshUnread');

      await expect(service.send(userId, '7', 'Hello')).resolves.toEqual(
        expect.objectContaining({ fromMe: true }),
      );
      expect(notify).not.toHaveBeenCalled();
    });

    it('still returns the message when the notice cannot be saved', async () => {
      sendAs('coordinator');
      jest
        .spyOn(notifications, 'createOrRefreshUnread')
        .mockRejectedValue(new Error('connection lost'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.send(userId, '7', 'Hello')).resolves.toEqual(
        expect.objectContaining({ id: '3', fromMe: true }),
      );
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('logs only the name of a failure, never its message or text', async () => {
      sendAs('coordinator');
      const failure = Object.assign(
        new Error('Unique constraint failed for ada.lee@example.com'),
        { name: 'PrismaClientKnownRequestError' },
      );
      const notify = jest
        .spyOn(notifications, 'createOrRefreshUnread')
        .mockRejectedValueOnce(failure)
        .mockRejectedValueOnce('Sam Tran sam@example.com');
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await service.send(userId, '7', 'One');
      await service.send(userId, '7', 'Two');

      expect(notify).toHaveBeenCalledTimes(2);
      expect((warn.mock.calls as [string][]).map(([line]) => line)).toEqual([
        'Could not notify about a new message: PrismaClientKnownRequestError',
        'Could not notify about a new message: UnknownError',
      ]);
    });

    it('keeps one unread notice per conversation however many messages arrive', async () => {
      sendAs('coordinator');
      const tx = unreadNotices();

      await service.send(userId, '7', 'One');
      await service.send(userId, '7', 'Two');
      await service.send(userId, '7', 'Three');

      expect(tx.notifications.create).toHaveBeenCalledTimes(1);
      expect(tx.notifications.updateMany).toHaveBeenCalledTimes(3);
    });

    it('gives each conversation its own notice', async () => {
      const tx = unreadNotices();

      sendAs('coordinator');
      await service.send(userId, '7', 'To Sam');
      sendAs('coordinator', matchRow({ coordinator_id: 6n }));
      await service.send(userId, '8', 'To someone else');

      expect(tx.notifications.create).toHaveBeenCalledTimes(2);
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
