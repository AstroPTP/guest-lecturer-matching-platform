import { Test, TestingModule } from '@nestjs/testing';
import { MatchRequestsService } from './match-requests.service';
import { CreateMatchRequestDto } from './dto/create-match-request.dto';

describe('MatchRequestsService', () => {
  let service: MatchRequestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MatchRequestsService],
    }).compile();

    service = module.get<MatchRequestsService>(MatchRequestsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new match request with a generated matchId, default status, and timestamps', () => {
      const dto: CreateMatchRequestDto = {
        unitId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        speakerId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      };

      const result = service.create(dto);

      expect(result.matchId).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.requestedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.unitId).toBe(dto.unitId);
      expect(result.speakerId).toBe(dto.speakerId);
    });

    it('should add the new match request to the list', () => {
      const dto: CreateMatchRequestDto = {
        unitId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        speakerId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      };

      service.create(dto);
      const all = service.findAll();

      expect(all).toHaveLength(1);
      expect(all[0].unitId).toBe(dto.unitId);
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no match requests exist', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('should return all created match requests', () => {
      service.create({ unitId: 'unit-1', speakerId: 'speaker-1' });
      service.create({ unitId: 'unit-2', speakerId: 'speaker-2' });

      expect(service.findAll()).toHaveLength(2);
    });
  });
});