import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  Logger,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { prisma } from '../prisma';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AppRole } from '../auth/roles';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { NotificationsService } from '../notifications/notifications.service';
import { MAX_ATTACHMENT_BYTES } from './attachments';
import { OpenSupportThreadDto } from './dto/open-support-thread.dto';
import { SetSupportStatusDto } from './dto/set-support-status.dto';
import { SupportReplyDto } from './dto/support-reply.dto';
import { UserSupportMessageDto } from './dto/user-support-message.dto';
import { SupportAdminController } from './support-admin.controller';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// ---------------------------------------------------------------------------
// A small in-memory database
//
// The service is tested against rows that behave like the real tables rather
// than against canned answers, so a check such as "this thread belongs to the
// caller" is only passed when the service really makes it. It understands the
// few query shapes the service uses: equality and `in` filters, ordering and
// `take`.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (
      condition !== null &&
      typeof condition === 'object' &&
      'in' in condition
    ) {
      return (condition as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === condition;
  });
}

function sorted(rows: Row[], orderBy?: Row | Row[]): Row[] {
  const keys = ([] as Row[]).concat(orderBy ?? []);
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const [field, direction] = Object.entries(key)[0] as [string, string];
      const left = a[field] as number | bigint | Date;
      const right = b[field] as number | bigint | Date;
      if (left < right) return direction === 'asc' ? -1 : 1;
      if (left > right) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

const ALICE = 'auth0|alice';
const BOB = 'auth0|bob';
const ADMIN = 'auth0|admin';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = Buffer.from('%PDF-1.7 1 0 obj <<>> ');

function upload(
  bytes: Buffer,
  mimetype: string,
  originalname = 'scan',
): Express.Multer.File {
  return {
    fieldname: 'attachment',
    originalname,
    encoding: '7bit',
    mimetype,
    size: bytes.length,
    buffer: bytes,
  } as Express.Multer.File;
}

function fakeDatabase() {
  let clock = Date.parse('2026-10-20T00:00:00.000Z');
  const next = () => new Date((clock += 1000));
  const ids = { thread: 100n, message: 1000n, attachment: 500n };

  const db = {
    users: [
      {
        userid: 1n,
        auth0Id: ADMIN,
        email: 'admin@curtin.edu.au',
        role: 'ccae_admin',
        deletedat: null,
        guest: null,
        coordinator: null,
      },
      {
        userid: 2n,
        auth0Id: ALICE,
        email: 'alice@example.com',
        role: 'guest_speaker',
        deletedat: null,
        guest: { first_name: 'Alice', last_name: 'Nguyen' },
        coordinator: null,
      },
      {
        userid: 3n,
        auth0Id: BOB,
        email: 'bob@curtin.edu.au',
        role: 'unit_coordinator',
        deletedat: null,
        guest: null,
        coordinator: { first_name: 'Bob', last_name: 'Smith' },
      },
      {
        userid: 4n,
        auth0Id: 'auth0|carol',
        email: 'carol@example.com',
        role: 'guest_speaker',
        deletedat: new Date('2026-09-01T00:00:00.000Z'),
        guest: null,
        coordinator: null,
      },
      {
        // Has signed in but never saved a lecturer or coordinator profile.
        userid: 5n,
        auth0Id: 'auth0|dave',
        email: 'dave@example.com',
        role: 'guest_speaker',
        deletedat: null,
        guest: null,
        coordinator: null,
      },
    ] as Row[],
    threads: [] as Row[],
    messages: [] as Row[],
    attachments: [] as Row[],
    audits: [] as Row[],
  };

  jest
    .spyOn(prisma.users, 'findUnique')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.users.find((u) => matches(u, args.where)) ?? null,
      )) as never);
  jest
    .spyOn(prisma.users, 'findFirst')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.users.find((u) => matches(u, args.where)) ?? null,
      )) as never);
  jest
    .spyOn(prisma.users, 'findMany')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.users.filter((u) => matches(u, args.where)),
      )) as never);

  jest.spyOn(prisma.support_threads, 'create').mockImplementation(((args: {
    data: Row;
  }) => {
    const row = {
      thread_id: ++ids.thread,
      status: 'open',
      created_at: next(),
      updated_at: next(),
      ...args.data,
    };
    db.threads.push(row);
    return Promise.resolve(row);
  }) as never);
  jest
    .spyOn(prisma.support_threads, 'findUnique')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.threads.find((t) => matches(t, args.where)) ?? null,
      )) as never);
  jest
    .spyOn(prisma.support_threads, 'findFirst')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.threads.find((t) => matches(t, args.where)) ?? null,
      )) as never);
  jest.spyOn(prisma.support_threads, 'findMany').mockImplementation(((args: {
    where?: Row;
    orderBy?: Row;
    take?: number;
  }) =>
    Promise.resolve(
      sorted(
        db.threads.filter((t) => matches(t, args.where)),
        args.orderBy,
      ).slice(0, args.take),
    )) as never);
  jest.spyOn(prisma.support_threads, 'update').mockImplementation(((args: {
    where: Row;
    data: Row;
  }) => {
    const row = db.threads.find((t) => matches(t, args.where));
    if (!row) return Promise.reject(new Error('no such thread'));
    Object.assign(row, args.data);
    return Promise.resolve(row);
  }) as never);

  jest.spyOn(prisma.support_messages, 'create').mockImplementation(((args: {
    data: Row;
  }) => {
    const row = {
      message_id: ++ids.message,
      attachment_id: null,
      read_at: null,
      sent_at: next(),
      ...args.data,
    };
    db.messages.push(row);
    return Promise.resolve(row);
  }) as never);
  jest.spyOn(prisma.support_messages, 'findMany').mockImplementation(((args: {
    where?: Row;
    orderBy?: Row | Row[];
  }) =>
    Promise.resolve(
      sorted(
        db.messages.filter((m) => matches(m, args.where)),
        args.orderBy,
      ),
    )) as never);
  jest.spyOn(prisma.support_messages, 'findFirst').mockImplementation(((args: {
    where?: Row;
    orderBy?: Row | Row[];
  }) =>
    Promise.resolve(
      sorted(
        db.messages.filter((m) => matches(m, args.where)),
        args.orderBy,
      )[0] ?? null,
    )) as never);
  jest.spyOn(prisma.support_messages, 'updateMany').mockImplementation(((args: {
    where: Row;
    data: Row;
  }) => {
    const rows = db.messages.filter((m) => matches(m, args.where));
    rows.forEach((row) => Object.assign(row, args.data));
    return Promise.resolve({ count: rows.length });
  }) as never);

  jest.spyOn(prisma.support_attachments, 'create').mockImplementation(((args: {
    data: Row;
  }) => {
    const row = {
      attachment_id: ++ids.attachment,
      uploaded_at: next(),
      ...args.data,
    };
    db.attachments.push(row);
    return Promise.resolve(row);
  }) as never);
  jest
    .spyOn(prisma.support_attachments, 'findUnique')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        db.attachments.find((a) => matches(a, args.where)) ?? null,
      )) as never);
  jest
    .spyOn(prisma.support_attachments, 'findMany')
    .mockImplementation(((args: { where?: Row }) =>
      Promise.resolve(
        db.attachments.filter((a) => matches(a, args.where)),
      )) as never);

  jest
    .spyOn(prisma, '$transaction')
    .mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
  jest.spyOn(prisma.audit_entries, 'create').mockImplementation(((args: {
    data: Row;
  }) => {
    db.audits.push(args.data);
    return Promise.resolve(args.data);
  }) as never);

  return db;
}

type Db = ReturnType<typeof fakeDatabase>;

/** Adds a thread to the fake database the way an administrator's request would. */
function seedThread(
  db: Db,
  options: {
    userId?: bigint;
    subject?: string;
    status?: string;
    messages?: {
      sender: 'admin' | 'user';
      read?: boolean;
      attachment?: bigint;
    }[];
  } = {},
) {
  const threadId = BigInt(db.threads.length + 1);
  db.threads.push({
    thread_id: threadId,
    user_id: options.userId ?? 2n,
    subject: options.subject ?? 'Please confirm your employer',
    status: options.status ?? 'open',
    opened_by_auth0_id: ADMIN,
    created_at: new Date('2026-10-20T01:00:00.000Z'),
    updated_at: new Date('2026-10-20T01:00:00.000Z'),
  });
  (options.messages ?? [{ sender: 'admin' }]).forEach((m, index) => {
    db.messages.push({
      message_id: BigInt(db.messages.length + 1),
      thread_id: threadId,
      sender: m.sender,
      content: `${m.sender} message ${index + 1}`,
      attachment_id: m.attachment ?? null,
      read_at: m.read ? new Date('2026-10-20T02:00:00.000Z') : null,
      sent_at: new Date(Date.parse('2026-10-20T01:00:00.000Z') + index * 1000),
    });
  });
  return threadId.toString();
}

function seedAttachment(db: Db, mime = 'application/pdf', name = 'id.pdf') {
  const id = BigInt(db.attachments.length + 1);
  db.attachments.push({
    attachment_id: id,
    data: new Uint8Array(mime === 'image/png' ? PNG : PDF),
    mime_type: mime,
    filename: name,
    size_bytes: 20,
    uploaded_at: new Date(),
  });
  return id;
}

/** A controller method, read off its descriptor so it is not called unbound. */
const handlerOf = (controller: { prototype: object }, name: string): object =>
  Object.getOwnPropertyDescriptor(controller.prototype, name)?.value as object;

const asUser = (id: string, roles: AppRole[] = []): AuthenticatedUser => ({
  id,
  roles,
});

let db: Db;
let notifications: { create: jest.Mock };
let service: SupportService;

beforeEach(() => {
  db = fakeDatabase();
  notifications = { create: jest.fn().mockResolvedValue({}) };
  service = new SupportService(
    notifications as unknown as NotificationsService,
  );
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// Who can reach which routes
// ---------------------------------------------------------------------------

describe('SupportAdminController access', () => {
  const handlers = [
    ['open', 'threads', RequestMethod.POST],
    ['list', 'threads', RequestMethod.GET],
    ['detail', 'threads/:id', RequestMethod.GET],
    ['reply', 'threads/:id/messages', RequestMethod.POST],
    ['setStatus', 'threads/:id', RequestMethod.PATCH],
  ] as const;

  it('is restricted to CCAE administrators at class level, so every route inherits it', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SupportAdminController)).toEqual([
      AppRole.CcaeAdmin,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, SupportAdminController)).toBe(
      'admin/support',
    );
  });

  it('has a route for each thing an administrator can do, and no others', () => {
    const own = Object.getOwnPropertyNames(
      SupportAdminController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(own.sort()).toEqual(handlers.map(([name]) => name).sort());
  });

  it.each(handlers)(
    '%s is mapped to the expected path and verb',
    (name, path, verb) => {
      const route = SupportAdminController.prototype[name];

      expect(Reflect.getMetadata(PATH_METADATA, route)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(verb);
    },
  );

  it.each(handlers)(
    '%s sets no role or public override, so the class-level ccae_admin applies',
    (name) => {
      const route = SupportAdminController.prototype[name];

      expect(Reflect.getMetadata(ROLES_KEY, route)).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, route)).toBeUndefined();
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, SupportAdminController),
      ).toBeUndefined();
    },
  );

  describe.each(handlers)('RolesGuard on %s', (name) => {
    const guard = new RolesGuard(new Reflector());
    const contextFor = (roles: AppRole[]) =>
      ({
        getHandler: () => SupportAdminController.prototype[name],
        getClass: () => SupportAdminController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'auth0|someone', roles } }),
        }),
      }) as unknown as ExecutionContext;

    it('admits a CCAE administrator', () => {
      expect(guard.canActivate(contextFor([AppRole.CcaeAdmin]))).toBe(true);
    });

    it.each([
      [[AppRole.UnitCoordinator]],
      [[AppRole.GuestSpeaker]],
      [[AppRole.UnitCoordinator, AppRole.GuestSpeaker]],
      [[]],
    ])('refuses a caller holding %j', (roles) => {
      expect(() => guard.canActivate(contextFor(roles))).toThrow(/permission/);
    });
  });
});

describe('SupportController access', () => {
  const handlers = [
    ['mine', 'threads', RequestMethod.GET],
    ['one', 'threads/:id', RequestMethod.GET],
    ['reply', 'threads/:id/messages', RequestMethod.POST],
    ['read', 'threads/:id/read', RequestMethod.PATCH],
    ['download', 'attachments/:id', RequestMethod.GET],
  ] as const;

  it('serves /support, open to any signed-in user but not to the public', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SupportController)).toBe(
      'support',
    );
    // No role is required, so a user with no lecturer or coordinator profile
    // is not turned away; authentication alone is enough.
    expect(Reflect.getMetadata(ROLES_KEY, SupportController)).toBeUndefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, SupportController),
    ).toBeUndefined();
  });

  it.each(handlers)(
    '%s is mapped, requires sign-in and sets no role',
    (name, path, verb) => {
      const route = SupportController.prototype[name];

      expect(Reflect.getMetadata(PATH_METADATA, route)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(verb);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, route)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, route)).toBeUndefined();
    },
  );

  it('admits any role, and a caller with none, through the roles guard', () => {
    const guard = new RolesGuard(new Reflector());
    for (const roles of [
      [AppRole.GuestSpeaker],
      [AppRole.UnitCoordinator],
      [],
    ]) {
      const context = {
        getHandler: () => handlerOf(SupportController, 'mine'),
        getClass: () => SupportController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'auth0|someone', roles } }),
        }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('limits how often a user can upload, since each file is up to 5MB in the database', () => {
    const route = handlerOf(SupportController, 'reply');

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', route)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', route)).toBe(60_000);
  });
});

describe('DTOs', () => {
  it('accepts a well-formed request to open a thread, trimming the text', async () => {
    const dto = plainToInstance(OpenSupportThreadDto, {
      userId: '2',
      subject: '  Confirm your employer  ',
      message: '  Please send a staff card.  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.subject).toBe('Confirm your employer');
    expect(dto.message).toBe('Please send a staff card.');
  });

  it.each([
    [{ userId: 'abc', subject: 's', message: 'm' }],
    [{ userId: '2', subject: '', message: 'm' }],
    [{ userId: '2', subject: '   ', message: 'm' }],
    [{ userId: '2', subject: 'x'.repeat(151), message: 'm' }],
    [{ userId: '2', subject: 's', message: '' }],
    [{ userId: '2', subject: 's', message: 'x'.repeat(2001) }],
    [{ subject: 's', message: 'm' }],
  ])('rejects %j when opening a thread', async (body) => {
    expect(
      (await validate(plainToInstance(OpenSupportThreadDto, body))).length,
    ).toBeGreaterThan(0);
  });

  it('allows a subject of 150 characters and a message of 2000', async () => {
    const dto = plainToInstance(OpenSupportThreadDto, {
      userId: '2',
      subject: 'x'.repeat(150),
      message: 'y'.repeat(2000),
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('requires text in an administrator reply', async () => {
    expect(
      await validate(plainToInstance(SupportReplyDto, { content: 'ok' })),
    ).toHaveLength(0);
    for (const content of ['', '  ', undefined, 'x'.repeat(2001)]) {
      expect(
        (await validate(plainToInstance(SupportReplyDto, { content }))).length,
      ).toBeGreaterThan(0);
    }
  });

  it('lets a user reply with no text, and caps the text at 2000', async () => {
    expect(
      await validate(plainToInstance(UserSupportMessageDto, {})),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(UserSupportMessageDto, { content: 'x'.repeat(2001) }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each(['open', 'closed'])('accepts the status %s', async (status) => {
    expect(
      await validate(plainToInstance(SetSupportStatusDto, { status })),
    ).toHaveLength(0);
  });

  it.each(['resolved', 'OPEN', '', undefined])(
    'rejects the status %p',
    async (status) => {
      expect(
        (await validate(plainToInstance(SetSupportStatusDto, { status })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Administrator
// ---------------------------------------------------------------------------

describe('SupportService.openThread', () => {
  const dto = (overrides: Partial<OpenSupportThreadDto> = {}) =>
    Object.assign(new OpenSupportThreadDto(), {
      userId: '2',
      subject: 'Confirm your employer',
      message: 'Please send a copy of your staff card.',
      ...overrides,
    });

  it('opens an open thread for that user and writes the first message as the administrator', async () => {
    const result = await service.openThread(ADMIN, dto());

    expect(db.threads).toHaveLength(1);
    expect(db.threads[0]).toMatchObject({
      user_id: 2n,
      subject: 'Confirm your employer',
      opened_by_auth0_id: ADMIN,
      status: 'open',
    });
    expect(result.id).toBe(String(db.threads[0].thread_id));
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({
      thread_id: db.threads[0].thread_id,
      sender: 'admin',
      content: 'Please send a copy of your staff card.',
    });
  });

  it('tells the user, with a link to their Messages page', async () => {
    await service.openThread(ADMIN, dto());

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: ALICE,
      type: 'admin',
      title: 'Action required',
      description: 'CCAE has asked for more details: Confirm your employer',
      actionLabel: 'Open message',
      href: '/guest_lecturer/messages',
    });
  });

  it("links a unit coordinator to the coordinator's Messages page", async () => {
    await service.openThread(ADMIN, dto({ userId: '3' }));

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: BOB,
        href: '/unit_coordinator/messages',
      }),
    );
  });

  it('works for a user who has no lecturer or coordinator profile', async () => {
    await expect(
      service.openThread(ADMIN, dto({ userId: '5' })),
    ).resolves.toEqual({ id: expect.any(String) as string });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'auth0|dave' }),
    );
  });

  it('records support.requested against the thread, as the administrator', async () => {
    const { id } = await service.openThread(ADMIN, dto());

    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({
      actor_user_id: 1n,
      action: 'support.requested',
      target_type: 'support_thread',
      target_id: id,
      detail: { userId: '2' },
    });
  });

  it('keeps the message text out of the audit row', async () => {
    await service.openThread(ADMIN, dto());

    expect(
      JSON.stringify(db.audits[0], (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ).not.toContain('staff card');
  });

  describe('when the person already has an open request', () => {
    const refusal = { response: { code: 'SUPPORT_REQUEST_ALREADY_OPEN' } };

    it('refuses with a 409 that says where to go, and writes nothing more', async () => {
      seedThread(db, { userId: 2n });
      const audits = db.audits.length;

      const attempt = service.openThread(ADMIN, dto());

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject(refusal);
      await expect(attempt).rejects.toMatchObject({
        response: {
          message:
            'This person already has an open request. Reply there or close it first.',
        },
      });
      expect(db.threads).toHaveLength(1);
      expect(db.messages).toHaveLength(1);
      expect(db.audits).toHaveLength(audits);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('opens a new one once the earlier request is closed', async () => {
      seedThread(db, { userId: 2n, status: 'closed' });

      await service.openThread(ADMIN, dto());

      expect(db.threads.map((t) => t.status)).toEqual(['closed', 'open']);
    });

    it('is not held up by somebody else’s open request', async () => {
      seedThread(db, { userId: 3n });

      await service.openThread(ADMIN, dto({ userId: '2' }));

      expect(db.threads).toHaveLength(2);
    });

    it('takes the person’s lock before it looks, so two opened together cannot both pass', async () => {
      const lock = jest.spyOn(prisma, '$executeRaw');
      const look = jest.spyOn(prisma.support_threads, 'findFirst');

      await service.openThread(ADMIN, dto());

      expect(lock).toHaveBeenCalledTimes(1);
      const [, namespace, key] = lock.mock.calls[0] as unknown as [
        unknown,
        number,
        number,
      ];
      expect(key).toBe(2);
      expect(namespace).toBeGreaterThan(0);
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
        look.mock.invocationCallOrder[0],
      );
    });
  });

  it('refuses an unknown user and writes nothing', async () => {
    await expect(
      service.openThread(ADMIN, dto({ userId: '999' })),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.threads).toHaveLength(0);
    expect(db.messages).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account, which could not read the request', async () => {
    await expect(
      service.openThread(ADMIN, dto({ userId: '4' })),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(db.threads).toHaveLength(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('still opens the thread when the notification cannot be created', async () => {
    notifications.create.mockRejectedValue(new Error('down'));
    const warn = jest.spyOn(Logger.prototype, 'warn');

    await expect(service.openThread(ADMIN, dto())).resolves.toEqual({
      id: expect.any(String) as string,
    });
    expect(db.threads).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe('SupportService.listThreads', () => {
  it('lists each thread with the user, the status and how many of their messages are unread', async () => {
    seedThread(db, {
      userId: 2n,
      messages: [
        { sender: 'admin', read: true },
        { sender: 'user' },
        { sender: 'user' },
      ],
    });
    seedThread(db, {
      userId: 3n,
      subject: 'Second',
      status: 'closed',
      messages: [{ sender: 'admin' }],
    });

    const list = await service.listThreads();

    expect(list).toHaveLength(2);
    expect(list.find((t) => t.userId === '2')).toMatchObject({
      userName: 'Alice Nguyen',
      userEmail: 'alice@example.com',
      userRole: 'guest_speaker',
      subject: 'Please confirm your employer',
      status: 'open',
      unreadFromUser: 2,
    });
    expect(list.find((t) => t.userId === '3')).toMatchObject({
      userName: 'Bob Smith',
      userRole: 'unit_coordinator',
      status: 'closed',
      unreadFromUser: 0,
    });
  });

  it("does not count the administrator's own messages as unread from the user", async () => {
    seedThread(db, { messages: [{ sender: 'admin' }, { sender: 'admin' }] });

    expect((await service.listThreads())[0].unreadFromUser).toBe(0);
  });

  it('names a user with no profile by their email', async () => {
    seedThread(db, { userId: 5n });

    expect((await service.listThreads())[0].userName).toBe('dave@example.com');
  });

  it('is empty when there are no requests', async () => {
    await expect(service.listThreads()).resolves.toEqual([]);
  });
});

describe('SupportService.getThreadForAdmin', () => {
  it('returns the messages in order, with the user, and marks the ones from the user as read', async () => {
    const id = seedThread(db, {
      messages: [{ sender: 'admin', read: true }, { sender: 'user' }],
    });

    const detail = await service.getThreadForAdmin(id);

    expect(detail.user).toMatchObject({ id: '2', name: 'Alice Nguyen' });
    expect(detail.messages.map((m) => m.sender)).toEqual(['admin', 'user']);
    expect(detail.messages[1].readAt).not.toBeNull();
    expect((await service.listThreads())[0].unreadFromUser).toBe(0);
  });

  it('leaves the administrator messages as the user has or has not read them', async () => {
    const id = seedThread(db, { messages: [{ sender: 'admin' }] });

    await service.getThreadForAdmin(id);

    expect(db.messages[0].read_at).toBeNull();
  });

  it('describes an attachment without loading the file', async () => {
    const attachment = seedAttachment(db, 'image/png', 'id.png');
    const id = seedThread(db, {
      messages: [{ sender: 'user', attachment }],
    });

    const detail = await service.getThreadForAdmin(id);

    expect(detail.messages[0].attachment).toEqual({
      id: String(attachment),
      filename: 'id.png',
      mimeType: 'image/png',
      sizeBytes: 20,
    });
    expect(JSON.stringify(detail)).not.toContain('"data"');
  });

  it('reports a thread that does not exist', async () => {
    await expect(service.getThreadForAdmin('404')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses an id that is not a number', async () => {
    await expect(service.getThreadForAdmin('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('SupportService.adminReply', () => {
  it('adds an administrator message to an open thread and records support.replied', async () => {
    const id = seedThread(db, {
      messages: [{ sender: 'admin' }, { sender: 'user' }],
    });

    const message = await service.adminReply(ADMIN, id, 'Thank you.');

    expect(message).toMatchObject({ sender: 'admin', content: 'Thank you.' });
    expect(db.messages).toHaveLength(3);
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({
      actor_user_id: 1n,
      action: 'support.replied',
      target_type: 'support_thread',
      target_id: id,
      detail: { userId: '2' },
    });
  });

  it('tells the user there is a new message', async () => {
    const id = seedThread(db, { subject: 'Staff card' });

    await service.adminReply(ADMIN, id, 'One more thing.');

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ALICE,
        type: 'admin',
        title: 'New message from CCAE',
        description: 'CCAE replied about: Staff card',
        href: '/guest_lecturer/messages',
      }),
    );
  });

  it('moves the thread to the top of the list', async () => {
    const id = seedThread(db);
    const before = db.threads[0].updated_at as Date;

    await service.adminReply(ADMIN, id, 'Hello');

    expect((db.threads[0].updated_at as Date).getTime()).toBeGreaterThan(
      before.getTime(),
    );
  });

  it('refuses a reply on a closed thread and writes nothing', async () => {
    const id = seedThread(db, { status: 'closed' });

    await expect(service.adminReply(ADMIN, id, 'Hello')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(db.messages).toHaveLength(1);
    expect(db.audits).toHaveLength(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('reports a thread that does not exist', async () => {
    await expect(service.adminReply(ADMIN, '404', 'Hi')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SupportService.setStatus', () => {
  it('closes a thread and records support.closed', async () => {
    const id = seedThread(db);

    await expect(service.setStatus(ADMIN, id, 'closed')).resolves.toEqual({
      id,
      status: 'closed',
    });

    expect(db.threads[0].status).toBe('closed');
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({
      actor_user_id: 1n,
      action: 'support.closed',
      target_type: 'support_thread',
      target_id: id,
      detail: { userId: '2' },
    });
  });

  it('reopens a closed thread and records support.reopened', async () => {
    const id = seedThread(db, { status: 'closed' });

    await service.setStatus(ADMIN, id, 'open');

    expect(db.threads[0].status).toBe('open');
    expect(db.audits[0]).toMatchObject({ action: 'support.reopened' });
  });

  it('refuses to reopen a thread while the person has another one open', async () => {
    const closed = seedThread(db, { userId: 2n, status: 'closed' });
    seedThread(db, { userId: 2n });

    const attempt = service.setStatus(ADMIN, closed, 'open');

    await expect(attempt).rejects.toMatchObject({
      response: { code: 'SUPPORT_REQUEST_ALREADY_OPEN' },
    });
    expect(db.threads[0].status).toBe('closed');
    expect(db.audits).toHaveLength(0);
  });

  it('reopens a thread when the other open one belongs to somebody else', async () => {
    const closed = seedThread(db, { userId: 2n, status: 'closed' });
    seedThread(db, { userId: 3n });

    await service.setStatus(ADMIN, closed, 'open');

    expect(db.threads[0].status).toBe('open');
  });

  it('records nothing when the thread already has that status', async () => {
    const id = seedThread(db, { status: 'closed' });

    await expect(service.setStatus(ADMIN, id, 'closed')).resolves.toEqual({
      id,
      status: 'closed',
    });

    expect(db.audits).toHaveLength(0);
  });

  it('reports a thread that does not exist', async () => {
    await expect(
      service.setStatus(ADMIN, '404', 'closed'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.audits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The user
// ---------------------------------------------------------------------------

describe('SupportService.listMine', () => {
  it("shows a user their own threads and never anyone else's", async () => {
    seedThread(db, { userId: 2n, subject: 'Alice one' });
    seedThread(db, { userId: 2n, subject: 'Alice two' });
    seedThread(db, { userId: 3n, subject: 'Bob one' });

    const mine = await service.listMine(ALICE);

    expect(mine.map((t) => t.subject).sort()).toEqual([
      'Alice one',
      'Alice two',
    ]);
    expect((await service.listMine(BOB)).map((t) => t.subject)).toEqual([
      'Bob one',
    ]);
  });

  it('is empty for someone with no requests, and for a caller with no user row', async () => {
    seedThread(db, { userId: 3n });

    await expect(service.listMine(ALICE)).resolves.toEqual([]);
    await expect(service.listMine('auth0|stranger')).resolves.toEqual([]);
  });

  it('asks for action while a request is open with an unread message from CCAE', async () => {
    seedThread(db, { messages: [{ sender: 'admin' }] });

    expect((await service.listMine(ALICE))[0]).toMatchObject({
      status: 'open',
      unreadFromAdmin: 1,
      actionRequired: true,
      lastMessage: 'admin message 1',
    });
  });

  it('still asks for action after the message is read, until the user has replied', async () => {
    seedThread(db, { messages: [{ sender: 'admin', read: true }] });

    expect((await service.listMine(ALICE))[0]).toMatchObject({
      unreadFromAdmin: 0,
      actionRequired: true,
    });
  });

  it('stops asking for action once the user has had the last word', async () => {
    seedThread(db, {
      messages: [{ sender: 'admin', read: true }, { sender: 'user' }],
    });

    expect((await service.listMine(ALICE))[0]).toMatchObject({
      unreadFromAdmin: 0,
      actionRequired: false,
    });
  });

  it('never asks for action on a closed request', async () => {
    seedThread(db, { status: 'closed', messages: [{ sender: 'admin' }] });

    expect((await service.listMine(ALICE))[0]).toMatchObject({
      status: 'closed',
      actionRequired: false,
    });
  });
});

describe('SupportService.getMine', () => {
  it('returns the messages of a thread the caller owns', async () => {
    const id = seedThread(db, {
      messages: [{ sender: 'admin' }, { sender: 'user' }],
    });

    const detail = await service.getMine(ALICE, id);

    expect(detail.id).toBe(id);
    expect(detail.messages.map((m) => m.sender)).toEqual(['admin', 'user']);
    expect(detail.user).toBeUndefined();
  });

  it("reports someone else's thread as not found", async () => {
    const id = seedThread(db, { userId: 3n });

    await expect(service.getMine(ALICE, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports a missing thread, and a caller with no user row, as not found', async () => {
    const id = seedThread(db);

    await expect(service.getMine(ALICE, '404')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getMine('auth0|stranger', id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SupportService.postMine', () => {
  it('adds a reply from the user to their own open thread', async () => {
    const id = seedThread(db);

    const message = await service.postMine(
      ALICE,
      id,
      '  Here it is.  ',
      undefined,
    );

    expect(message).toMatchObject({
      sender: 'user',
      content: 'Here it is.',
      attachment: null,
    });
    expect(db.messages).toHaveLength(2);
    expect(db.messages[1]).toMatchObject({
      thread_id: BigInt(id),
      sender: 'user',
      attachment_id: null,
    });
  });

  it('stores one attached PDF with its real type, size and a clean name', async () => {
    const id = seedThread(db);

    const message = await service.postMine(
      ALICE,
      id,
      'Staff card attached',
      upload(PDF, 'application/pdf', '../my staff card.pdf'),
    );

    expect(db.attachments).toHaveLength(1);
    expect(db.attachments[0]).toMatchObject({
      mime_type: 'application/pdf',
      filename: 'my staff card.pdf',
      size_bytes: PDF.length,
    });
    expect(Buffer.from(db.attachments[0].data as Uint8Array).equals(PDF)).toBe(
      true,
    );
    expect(message.attachment).toEqual({
      id: String(db.attachments[0].attachment_id),
      filename: 'my staff card.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    expect(db.messages[1].attachment_id).toBe(db.attachments[0].attachment_id);
  });

  it('accepts a reply that is only a file', async () => {
    const id = seedThread(db);

    await expect(
      service.postMine(ALICE, id, undefined, upload(PNG, 'image/png')),
    ).resolves.toMatchObject({
      content: '',
      attachment: expect.anything() as unknown,
    });
  });

  it('refuses a reply with neither text nor a file', async () => {
    const id = seedThread(db);

    for (const content of [undefined, '', '   ']) {
      await expect(
        service.postMine(ALICE, id, content, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(db.messages).toHaveLength(1);
  });

  it('refuses a reply on a closed thread and stores nothing, not even the file', async () => {
    const id = seedThread(db, { status: 'closed' });

    await expect(
      service.postMine(ALICE, id, 'Hello', upload(PDF, 'application/pdf')),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(db.messages).toHaveLength(1);
    expect(db.attachments).toHaveLength(0);
  });

  it("refuses a reply to someone else's thread, and stores nothing", async () => {
    const id = seedThread(db, { userId: 3n });

    await expect(
      service.postMine(ALICE, id, 'Hello', upload(PDF, 'application/pdf')),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.messages).toHaveLength(1);
    expect(db.attachments).toHaveLength(0);
  });

  it("answers a closed thread of someone else's as not found, not as closed", async () => {
    const id = seedThread(db, { userId: 3n, status: 'closed' });

    await expect(
      service.postMine(ALICE, id, 'Hello', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a thread that does not exist', async () => {
    await expect(
      service.postMine(ALICE, '404', 'Hello', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [
      'an SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/svg+xml',
    ],
    [
      'an SVG sent as a PNG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/png',
    ],
    ['HTML sent as a PDF', Buffer.from('<html></html>'), 'application/pdf'],
    ['a PNG sent as a PDF', PNG, 'application/pdf'],
    ['an empty file', Buffer.alloc(0), 'image/png'],
  ])('refuses %s and stores nothing', async (_label, bytes, mime) => {
    const id = seedThread(db);

    await expect(
      service.postMine(ALICE, id, 'Here', upload(bytes, mime)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.messages).toHaveLength(1);
    expect(db.attachments).toHaveLength(0);
  });

  it('refuses a file over 5MB', async () => {
    const id = seedThread(db);
    const big = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1 - PDF.length),
    ]);

    await expect(
      service.postMine(ALICE, id, 'Here', upload(big, 'application/pdf')),
    ).rejects.toThrow(/too large/);
    expect(db.attachments).toHaveLength(0);
  });

  it('puts the thread back to the top of the administrator list', async () => {
    const id = seedThread(db);
    const before = db.threads[0].updated_at as Date;

    await service.postMine(ALICE, id, 'Reply', undefined);

    expect((db.threads[0].updated_at as Date).getTime()).toBeGreaterThan(
      before.getTime(),
    );
    expect((await service.listThreads())[0].unreadFromUser).toBe(1);
  });

  it('does not notify anyone or write an audit row, since the user is not an administrator', async () => {
    const id = seedThread(db);

    await service.postMine(ALICE, id, 'Reply', undefined);

    expect(notifications.create).not.toHaveBeenCalled();
    expect(db.audits).toHaveLength(0);
  });
});

describe('SupportService.markRead', () => {
  it("marks CCAE's messages in the caller's thread as read, and the caller's own untouched", async () => {
    const id = seedThread(db, {
      messages: [{ sender: 'admin' }, { sender: 'user' }, { sender: 'admin' }],
    });

    await expect(service.markRead(ALICE, id)).resolves.toEqual({
      success: true,
    });

    expect(db.messages.map((m) => m.read_at !== null)).toEqual([
      true,
      false,
      true,
    ]);
    expect((await service.listMine(ALICE))[0].unreadFromAdmin).toBe(0);
  });

  it("does not touch someone else's thread", async () => {
    const id = seedThread(db, { userId: 3n });

    await expect(service.markRead(ALICE, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.messages[0].read_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Downloading an attachment
// ---------------------------------------------------------------------------

describe('SupportService.getAttachment', () => {
  function threadWithFile(owner: bigint = 2n) {
    const attachment = seedAttachment(db);
    seedThread(db, {
      userId: owner,
      messages: [{ sender: 'user', attachment }],
    });
    return String(attachment);
  }

  it('gives the file to the user it belongs to', async () => {
    const id = threadWithFile(2n);

    const file = await service.getAttachment(asUser(ALICE), id);

    expect(file.mime_type).toBe('application/pdf');
    expect(Buffer.from(file.data).equals(PDF)).toBe(true);
  });

  it('gives the file to an administrator, found by the roles claim', async () => {
    const id = threadWithFile(2n);

    await expect(
      service.getAttachment(asUser(ADMIN, [AppRole.CcaeAdmin]), id),
    ).resolves.toMatchObject({ filename: 'id.pdf' });
  });

  it('gives the file to an administrator who holds another role as well', async () => {
    const id = threadWithFile(2n);

    await expect(
      service.getAttachment(
        asUser(ADMIN, [AppRole.GuestSpeaker, AppRole.CcaeAdmin]),
        id,
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ['another user', BOB, [AppRole.UnitCoordinator]],
    ['another user with no roles', BOB, []],
    ['a guest lecturer', BOB, [AppRole.GuestSpeaker]],
    ['someone with no user row', 'auth0|stranger', []],
  ])('answers not found for %s', async (_label, caller, roles) => {
    const id = threadWithFile(2n);

    await expect(
      service.getAttachment(asUser(caller, roles), id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not read the file at all for a caller who may not have it', async () => {
    const id = threadWithFile(2n);

    await expect(service.getAttachment(asUser(BOB), id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(
      jest.spyOn(prisma.support_attachments, 'findUnique'),
    ).not.toHaveBeenCalled();
  });

  it('answers a missing file the same way as a forbidden one', async () => {
    const forbidden = await service
      .getAttachment(asUser(BOB), threadWithFile(2n))
      .catch((e: Error) => e);
    const missing = await service
      .getAttachment(asUser(BOB), '999')
      .catch((e: Error) => e);

    expect(forbidden).toBeInstanceOf(NotFoundException);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect((forbidden as Error).message).toBe((missing as Error).message);
  });

  it('gives an administrator not found for a file that does not exist', async () => {
    await expect(
      service.getAttachment(asUser(ADMIN, [AppRole.CcaeAdmin]), '999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let the roles claim of an ordinary user stand in for an administrator', async () => {
    const id = threadWithFile(2n);

    await expect(
      service.getAttachment(
        asUser(BOB, [AppRole.GuestSpeaker, AppRole.UnitCoordinator]),
        id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an id that is not a number', async () => {
    await expect(
      service.getAttachment(asUser(ALICE), 'abc'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SupportController.download', () => {
  function respond() {
    const res = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return res;
  }

  it('sends the bytes with the stored type, nosniff and a download disposition for a PDF', async () => {
    const attachment = seedAttachment(db, 'application/pdf', 'id.pdf');
    seedThread(db, { messages: [{ sender: 'user', attachment }] });
    const controller = new SupportController(service);
    const res = respond();

    await controller.download(String(attachment), asUser(ALICE), res as never);

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment; filename="id.pdf"',
      }),
    );
    const [sent] = res.send.mock.calls[0] as [Buffer];
    expect(sent.equals(PDF)).toBe(true);
  });

  it('shows an image inline', async () => {
    const attachment = seedAttachment(db, 'image/png', 'id.png');
    seedThread(db, { messages: [{ sender: 'user', attachment }] });
    const controller = new SupportController(service);
    const res = respond();

    await controller.download(
      String(attachment),
      asUser(ADMIN, [AppRole.CcaeAdmin]),
      res as never,
    );

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="id.png"',
        'X-Content-Type-Options': 'nosniff',
      }),
    );
  });

  it('sends nothing to someone who may not have it', async () => {
    const attachment = seedAttachment(db);
    seedThread(db, { messages: [{ sender: 'user', attachment }] });
    const controller = new SupportController(service);
    const res = respond();

    await expect(
      controller.download(String(attachment), asUser(BOB), res as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(res.set).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// What the client is told
// ---------------------------------------------------------------------------

describe('refusals carry a code and a message the user can read', () => {
  /** The `{ code, message }` the global filter passes through to the client. */
  async function payloadOf(promise: Promise<unknown>) {
    const error = (await promise.catch((e: unknown) => e)) as {
      getResponse: () => { code?: string; message?: string };
    };
    return error.getResponse();
  }

  it.each([
    [
      'a closed thread',
      () => {
        const id = seedThread(db, { status: 'closed' });
        return service.postMine(ALICE, id, 'Hello', undefined);
      },
      'SUPPORT_THREAD_CLOSED',
    ],
    [
      'an empty reply',
      () => {
        const id = seedThread(db);
        return service.postMine(ALICE, id, '', undefined);
      },
      'SUPPORT_MESSAGE_EMPTY',
    ],
    [
      'an unsupported file',
      () => {
        const id = seedThread(db);
        return service.postMine(
          ALICE,
          id,
          '',
          upload(Buffer.from('<svg/>'), 'image/svg+xml'),
        );
      },
      'SUPPORT_ATTACHMENT_INVALID',
    ],
    [
      'a thread that is not theirs',
      () => {
        const id = seedThread(db, { userId: 3n });
        return service.getMine(ALICE, id);
      },
      'SUPPORT_THREAD_NOT_FOUND',
    ],
    [
      'a deactivated account',
      () =>
        service.openThread(
          ADMIN,
          Object.assign(new OpenSupportThreadDto(), {
            userId: '4',
            subject: 's',
            message: 'm',
          }),
        ),
      'SUPPORT_USER_DEACTIVATED',
    ],
  ])('for %s', async (_label, attempt, code) => {
    const payload = await payloadOf(attempt());

    expect(payload.code).toBe(code);
    expect(payload.message).toEqual(expect.any(String));
    expect(payload.message?.length).toBeGreaterThan(10);
  });
});
