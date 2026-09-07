import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersService } from './guest-speakers.service';
import { CreateGuestSpeakerDto } from './dto/create-guest-speaker.dto';

describe('GuestSpeakersService', () => {
  let service: GuestSpeakersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestSpeakersService],
    }).compile();

    service = module.get<GuestSpeakersService>(GuestSpeakersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new guest speaker with a generated speakerId', () => {
      const dto: CreateGuestSpeakerDto = {
        expertiseAreas: ['Cybersecurity', 'Cloud Computing'],
        presentationTopics: ['Intro to Zero Trust'],
        availability: 'Weekday afternoons',
        phoneNumber: '+61412345678',
        directEmail: 'speaker@example.com',
      };

      const result = service.create(dto);

      expect(result.speakerId).toBeDefined();
      expect(result.expertiseAreas).toEqual(dto.expertiseAreas);
      expect(result.presentationTopics).toEqual(dto.presentationTopics);
      expect(result.availability).toBe(dto.availability);
    });

    it('should create a guest speaker without optional fields', () => {
      const dto: CreateGuestSpeakerDto = {
        expertiseAreas: ['Data Science'],
        presentationTopics: ['Intro to ML'],
      };

      const result = service.create(dto);

      expect(result.speakerId).toBeDefined();
      expect(result.availability).toBeUndefined();
      expect(result.phoneNumber).toBeUndefined();
      expect(result.directEmail).toBeUndefined();
    });

    it('should add the new guest speaker to the list', () => {
      const dto: CreateGuestSpeakerDto = {
        expertiseAreas: ['AI Ethics'],
        presentationTopics: ['Responsible AI'],
      };

      service.create(dto);
      const all = service.findAll();

      expect(all).toHaveLength(1);
      expect(all[0].expertiseAreas).toEqual(dto.expertiseAreas);
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no guest speakers exist', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('should return all created guest speakers', () => {
      service.create({ expertiseAreas: ['A'], presentationTopics: ['B'] });
      service.create({ expertiseAreas: ['C'], presentationTopics: ['D'] });

      expect(service.findAll()).toHaveLength(2);
    });
  });
});