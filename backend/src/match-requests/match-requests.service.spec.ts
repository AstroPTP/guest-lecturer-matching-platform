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

  // The ids here are numeric because a match request references rows the
  // database assigned: the coordinator and the guest it is between. They used
  // to be UUIDs generated in memory, which had nothing to point at.
  describe('create', () => {
    it('writes the request and returns the stored row', async () => {
      const dto: CreateMatchRequestDto = { unitId: '1', speakerId: '2' };

      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('rejects an id that is not numeric, rather than failing mid-write', async () => {
      const dto: CreateMatchRequestDto = {
        unitId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        speakerId: '2',
      };

      await expect(service.create(dto)).rejects.toThrow('unitId');
    });
  });

  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });
});
