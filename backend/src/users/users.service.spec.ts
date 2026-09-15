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

  describe('create', () => {
    it('should create a new user with a generated uuid and createdAt', () => {
      const dto: CreateUserProfileDto = {
        auth0Id: 'auth0|123456789',
        email: 'audrey@example.com',
        role: UserRole.UNIT_COORDINATOR,
      };

      const result = service.create(dto);

      expect(result.uuid).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.auth0Id).toBe(dto.auth0Id);
      expect(result.email).toBe(dto.email);
      expect(result.role).toBe(dto.role);
    });

    it('should add the new user to the list', () => {
      const dto: CreateUserProfileDto = {
        auth0Id: 'auth0|987654321',
        email: 'speaker@example.com',
        role: UserRole.GUEST_SPEAKER,
      };

      service.create(dto);
      const all = service.findAll();

      expect(all).toHaveLength(1);
      expect(all[0].email).toBe(dto.email);
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no users exist', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('should return all created users', () => {
      service.create({
        auth0Id: 'auth0|1',
        email: 'a@example.com',
        role: UserRole.CCAE_ADMINISTRATOR,
      });
      service.create({
        auth0Id: 'auth0|2',
        email: 'b@example.com',
        role: UserRole.UNIT_COORDINATOR,
      });

      expect(service.findAll()).toHaveLength(2);
    });
  });
});
