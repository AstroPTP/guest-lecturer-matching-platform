import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { CreateMessagesDto } from './dto/create-messages.dto';

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rejects an id that is not numeric, rather than failing mid-write', async () => {
      const dto: CreateMessagesDto = {
        matchId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        content: 'hello',
      };

      await expect(service.create(dto)).rejects.toThrow('matchId');
    });
  });

  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });
});
