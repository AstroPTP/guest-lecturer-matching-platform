import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import { prisma } from '../prisma';

describe('GuestSpeakersService', () => {
  let service: GuestSpeakersService;

  // Auth0 subject; the double's resolveUserId maps every subject to 1n.
  const userId = 'auth0|user-123';

  const basicInformation: BasicInformationDto = {
    fullName: 'Jane Doe',
    bio: 'Security researcher and educator.',
    photoPreview: 'data:image/png;base64,abc123',
    professionalField: 'Cybersecurity',
    professionalRole: 'Principal Consultant',
  };

  const expertise: ExpertiseDto = {
    selectedTopics: ['Zero Trust', 'Cloud Security'],
    experienceLevel: 'Expert',
    hasSpeakingExperience: true,
    speakingDetails: 'Regular conference speaker.',
    hasInternationalExperience: false,
    internationalDetails: '',
    linkedin: 'https://linkedin.com/in/janedoe',
  };

  const engagement: EngagementDto = {
    primaryLocation: 'Perth, WA',
    audienceSize: '50-100',
    deliveryFocus: ['Workshops', 'Guest Lectures'],
    sessionDuration: '60 minutes',
    format: 'In-person',
    schedule: {
      availableDays: ['Monday', 'Wednesday'],
      availableFrom: '09:00',
      availableTo: '15:00',
      availabilityFrequency: 'Weekly',
      availabilityNotes: 'Prefers afternoon sessions.',
    },
  };

  const consent: ConsentDto = {
    profileMatchingConsent: true,
    informationAccurate: true,
    receiveUpdates: true,
    futureTeachingReuse: false,
    otherUnitsReuse: false,
    timeLimitedUse: true,
    termsAccepted: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestSpeakersService],
    }).compile();

    service = module.get<GuestSpeakersService>(GuestSpeakersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // The service writes through Prisma now rather than an in-memory map, so
  // these tests assert what it sends to the database. The real round trip is
  // covered by running the application.
  describe('findByUserId', () => {
    it('returns null when no guest row exists', async () => {
      await expect(service.findByUserId(userId)).resolves.toBeNull();
    });
  });

  describe('saveBasicInformation', () => {
    it('saves the guest row with the split name and profile fields', async () => {
      const upsert = jest.spyOn(prisma.guests, 'upsert');

      await service.saveBasicInformation(userId, basicInformation);

      const fields = {
        first_name: 'Jane',
        last_name: 'Doe',
        field: 'Cybersecurity',
        role: 'Principal Consultant',
        bio: 'Security researcher and educator.',
      };
      expect(upsert).toHaveBeenCalledWith({
        where: { user_id: 1n },
        update: fields,
        create: { user_id: 1n, ...fields },
      });
    });
  });

  describe('saveExpertise', () => {
    it('replaces the topic list wholesale', async () => {
      const deleteMany = jest.spyOn(prisma.user_expertise, 'deleteMany');
      const createMany = jest.spyOn(prisma.user_expertise, 'createMany');

      await service.saveExpertise(userId, expertise);

      expect(deleteMany).toHaveBeenCalledWith({ where: { user_id: 1n } });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { user_id: 1n, expertise: 'Zero Trust' },
          { user_id: 1n, expertise: 'Cloud Security' },
        ],
      });
    });

    it('does not insert topics when none are selected', async () => {
      const createMany = jest.spyOn(prisma.user_expertise, 'createMany');

      await service.saveExpertise(userId, { ...expertise, selectedTopics: [] });

      expect(createMany).not.toHaveBeenCalled();
    });
  });

  describe('saveEngagement', () => {
    it('creates an availability row when none exists', async () => {
      const create = jest.spyOn(prisma.availability, 'create');

      await service.saveEngagement(userId, engagement);

      expect(create).toHaveBeenCalledTimes(1);
    });

    it('updates the existing availability row instead of adding another', async () => {
      jest
        .spyOn(prisma.availability, 'findFirst')
        .mockResolvedValue({ id: 7n } as never);
      const update = jest.spyOn(prisma.availability, 'update');
      const create = jest.spyOn(prisma.availability, 'create');

      await service.saveEngagement(userId, engagement);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7n } }),
      );
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('saveConsent', () => {
    it('marks the profile as complete and returns the current profile', async () => {
      const update = jest.spyOn(prisma.users, 'update');

      await expect(service.saveConsent(userId, consent)).resolves.toBeNull();

      expect(update).toHaveBeenCalledWith({
        where: { userid: 1n },
        data: { consentstate: true },
      });
    });
  });

  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('leaves out guests whose account has been deactivated', async () => {
      const query = jest.spyOn(prisma.guests, 'findMany');

      await service.findAll();

      expect(query.mock.calls[0][0]).toMatchObject({
        where: {
          OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
        },
      });
      query.mockRestore();
    });
  });
});
