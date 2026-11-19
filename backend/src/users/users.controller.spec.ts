import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateUserProfileDto, UserRole } from './dto/create-user-profile.dto';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { AppRole } from '../auth/roles';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('UsersController behaviour', () => {
  const service = new UsersService();
  const controller = new UsersController(service);
  const caller: AuthenticatedUser = {
    id: 'auth0|ann',
    email: 'ann@example.com',
    roles: [AppRole.GuestSpeaker],
  };
  afterEach(() => jest.restoreAllMocks());

  describe('me', () => {
    it('loads the row for the caller named in the token and returns it', async () => {
      const ensure = jest
        .spyOn(service, 'ensureForUser')
        .mockResolvedValue({ userid: 3n, email: 'ann@example.com' } as never);

      await expect(controller.me(caller)).resolves.toMatchObject({
        userid: 3n,
        email: 'ann@example.com',
      });

      expect(ensure).toHaveBeenCalledWith(caller);
    });

    it('marks the profile complete only once consent has been given', async () => {
      const profileCompleted: unknown[] = [];
      for (const consentstate of [true, false, null]) {
        jest
          .spyOn(service, 'ensureForUser')
          .mockResolvedValue({ userid: 3n, consentstate } as never);
        const me = await controller.me(caller);
        profileCompleted.push(me.profileCompleted);
      }

      expect(profileCompleted).toEqual([true, false, false]);
    });
  });

  it('creates and lists users through the service', async () => {
    const dto: CreateUserProfileDto = {
      auth0Id: 'auth0|ann',
      email: 'ann@example.com',
      role: UserRole.GUEST_SPEAKER,
    };
    const create = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ userid: 3n } as never);
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await expect(controller.create(dto)).resolves.toEqual({ userid: 3n });
    await expect(controller.findAll()).resolves.toEqual([]);

    expect(create).toHaveBeenCalledWith(dto);
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  describe('creating a user', () => {
    // The same options the application applies to every request body.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const meta: ArgumentMetadata = {
      type: 'body',
      metatype: CreateUserProfileDto,
    };
    const valid = {
      auth0Id: 'auth0|ann',
      email: 'ann@example.com',
      role: UserRole.GUEST_SPEAKER,
    };

    it('accepts a well-formed user', async () => {
      await expect(pipe.transform(valid, meta)).resolves.toMatchObject(valid);
    });

    it('refuses a malformed email, an unknown role, an empty subject and fields a caller must not set', async () => {
      const bad = [
        { email: 'not-an-email' },
        { role: 'SUPERUSER' },
        { auth0Id: '' },
        { consentstate: true },
        { userid: 1 },
      ];
      const accepted: unknown[] = [];
      for (const change of bad) {
        await pipe
          .transform({ ...valid, ...change }, meta)
          .then(() => accepted.push(change))
          .catch((error: unknown) => {
            if (!(error instanceof BadRequestException)) throw error;
          });
      }

      expect(accepted).toEqual([]);
    });
  });
});
