import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { CreateUserProfileDto, UserRole } from './dto/create-user-profile.dto';
import { AppRole } from '../auth/roles';
import { prisma } from '../prisma';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // create writes through to the database now rather than an in-memory list,
  // so against the test double this resolves to the empty row it returns; the
  // real write is covered by running the application.
  describe('create', () => {
    it('creates the user through the database', async () => {
      const dto: CreateUserProfileDto = {
        auth0Id: 'auth0|123456789',
        email: 'audrey@example.com',
        role: UserRole.UNIT_COORDINATOR,
      };

      await expect(service.create(dto)).resolves.toEqual({});
    });
  });

  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  describe('findByAuth0Id', () => {
    it('returns null when no row matches', async () => {
      await expect(
        service.findByAuth0Id('auth0|does-not-exist'),
      ).resolves.toBeNull();
    });
  });
});

describe('UsersService behaviour', () => {
  const service = new UsersService();
  afterEach(() => jest.restoreAllMocks());

  it('looks a user up by their exact sign-in subject and never creates one', async () => {
    const row = { userid: 3n, auth0Id: 'auth0|ann' };
    const find = jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue(row as never);
    const create = jest.spyOn(prisma.users, 'create');
    const upsert = jest.spyOn(prisma.users, 'upsert');

    await expect(service.findByAuth0Id('auth0|ann')).resolves.toBe(row);

    expect(find).toHaveBeenCalledWith({ where: { auth0Id: 'auth0|ann' } });
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stamps the creation time when it creates a user', async () => {
    const create = jest.spyOn(prisma.users, 'create');

    await service.create({
      auth0Id: 'auth0|ann',
      email: 'ann@example.com',
      role: UserRole.GUEST_SPEAKER,
    });

    const { createdat, ...stored } = create.mock.calls[0][0].data;
    expect(stored).toEqual({
      auth0Id: 'auth0|ann',
      email: 'ann@example.com',
      role: UserRole.GUEST_SPEAKER,
    });
    expect(createdat).toBeInstanceOf(Date);
  });

  describe('ensureForUser', () => {
    const caller = {
      id: 'auth0|ann',
      email: 'ann@example.com',
      roles: [AppRole.UnitCoordinator, AppRole.GuestSpeaker],
    };

    it('keys the row on the caller subject and changes nothing for an existing user', async () => {
      const upsert = jest
        .spyOn(prisma.users, 'upsert')
        .mockResolvedValue({ userid: 3n } as never);

      await service.ensureForUser(caller);

      const args = upsert.mock.calls[0][0];
      expect(args.where).toEqual({ auth0Id: 'auth0|ann' });
      // An existing user's email and role are never overwritten from a token,
      // and the guard, not this, records the last login.
      expect(args.update).toEqual({});
    });

    it('creates a first-time user from the token claims, using the first role', async () => {
      const upsert = jest
        .spyOn(prisma.users, 'upsert')
        .mockResolvedValue({} as never);

      await service.ensureForUser(caller);

      const { createdat, ...created } = upsert.mock.calls[0][0].create;
      // No lastloginat: the guard records the first sign-in, which it can only
      // do while the stored time is missing.
      expect(created).toEqual({
        auth0Id: 'auth0|ann',
        email: 'ann@example.com',
        role: AppRole.UnitCoordinator,
      });
      expect(createdat).toBeInstanceOf(Date);
    });

    it('still creates a row for a caller whose token carries no roles', async () => {
      const upsert = jest
        .spyOn(prisma.users, 'upsert')
        .mockResolvedValue({} as never);

      await service.ensureForUser({ id: 'auth0|new', roles: [] });

      expect(upsert.mock.calls[0][0].create).toMatchObject({
        auth0Id: 'auth0|new',
        role: undefined,
      });
    });
  });
});
