import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

describe('GuestSpeakersService', () => {
  let service: GuestSpeakersService;

  const userId = 'user-123';

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUserId', () => {
    it('should return null when no profile exists for the user', () => {
      expect(service.findByUserId(userId)).toBeNull();
    });
  });

  describe('saveBasicInformation', () => {
    it('should create a profile and set basicInformation', () => {
      const result = service.saveBasicInformation(userId, basicInformation);

      expect(result.userId).toBe(userId);
      expect(result.basicInformation).toEqual(basicInformation);
    });

    it('should update basicInformation on an existing profile without overwriting other sections', () => {
      service.saveExpertise(userId, expertise);
      const result = service.saveBasicInformation(userId, basicInformation);

      expect(result.basicInformation).toEqual(basicInformation);
      expect(result.expertise).toEqual(expertise);
    });
  });

  describe('saveExpertise', () => {
    it('should set expertise on the profile', () => {
      const result = service.saveExpertise(userId, expertise);

      expect(result.expertise).toEqual(expertise);
    });
  });

  describe('saveEngagement', () => {
    it('should set engagementProfile on the profile', () => {
      const result = service.saveEngagement(userId, engagement);

      expect(result.engagementProfile).toEqual(engagement);
    });
  });

  describe('saveConsent', () => {
    it('should set consentPreferences on the profile', async () => {
      const result = await service.saveConsent(userId, consent);

      expect(result.consentPreferences).toEqual(consent);
    });
  });

  // findAll now reads the database rather than this process's memory, which is
  // the point of the change: the discovery page has to show stored rows, not
  // whatever one server happens to be holding. Against the test double that is
  // an empty list, so what is asserted here is the contract, and the real
  // retrieval is covered by running the application.
  describe('findAll', () => {
    it('returns what the database holds', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('does not return unsaved in-memory profiles', async () => {
      service.saveBasicInformation('user-1', basicInformation);
      service.saveBasicInformation('user-2', basicInformation);

      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('assembles the sections for one user into a single profile', async () => {
      service.saveBasicInformation(userId, basicInformation);
      service.saveExpertise(userId, expertise);
      service.saveEngagement(userId, engagement);
      await service.saveConsent(userId, consent);

      // findByUserId still reads the in-progress profile, which is what the
      // form needs while it is being filled in over several requests.
      expect(service.findByUserId(userId)).toEqual({
        userId,
        basicInformation,
        expertise,
        engagementProfile: engagement,
        consentPreferences: consent,
      });
    });
  });
});
