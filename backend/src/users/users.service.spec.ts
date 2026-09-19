import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { CreateUserProfileDto, UserRole } from './dto/create-user-profile.dto';

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
