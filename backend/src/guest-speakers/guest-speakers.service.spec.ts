import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import * as prismaModule from '../prisma';
import { prisma } from '../prisma';
import { stubOpenReports } from '../testing/open-reports';

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

    it('returns null for someone who has never saved a profile, without creating a user', async () => {
      jest.spyOn(prisma.users, 'findUnique').mockResolvedValue(null);
      const create = jest.spyOn(prisma.users, 'create');
      const upsert = jest.spyOn(prisma.users, 'upsert');
      // resolveUserId creates the user row if it is missing, so a read must not
      // go through it.
      const resolve = jest.spyOn(prismaModule, 'resolveUserId');

      await expect(service.findByUserId(userId)).resolves.toBeNull();
      expect(create).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
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

    describe('after reports', () => {
      /** Open reports as [reporter, reported] pairs; the double's viewer is user 1. */
      function reports(pairs: [reporter: bigint, reported: string][]) {
        stubOpenReports(
          pairs.map(([actor, target], i) => ({
            entry_id: BigInt(40 + i),
            actor_user_id: actor,
            target_id: target,
            detail: { reason: 'asked for money', matchId: '6001' },
          })),
        );
      }

      async function hiddenFromViewer() {
        const query = jest.spyOn(prisma.guests, 'findMany');
        await service.findAll('auth0|viewer');
        const { where } = query.mock.calls[0][0] as {
          where: { OR: unknown[]; AND: unknown[] };
        };
        query.mockRestore();
        return where;
      }

      it('leaves out a guest the viewer has reported, but not guests with no account', async () => {
        reports([[1n, '7']]);

        const where = await hiddenFromViewer();

        expect(where.AND).toEqual([
          { OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] },
        ]);
        // The deactivated-account rule is still there beside it.
        expect(where.OR).toEqual([
          { user_id: null },
          { users: { is: { deletedat: null } } },
        ]);
      });

      it('leaves out a guest who reported the viewer', async () => {
        reports([[7n, '1']]);

        expect((await hiddenFromViewer()).AND).toEqual([
          { OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] },
        ]);
      });

      it('keeps a guest in for everyone else when only one person reported them', async () => {
        reports([[8n, '7']]);

        expect((await hiddenFromViewer()).AND).toEqual([
          { OR: [{ user_id: null }, { user_id: { notIn: [] } }] },
        ]);
      });

      it('leaves a guest out for everyone once two different people reported them', async () => {
        reports([
          [8n, '7'],
          [9n, '7'],
        ]);

        expect((await hiddenFromViewer()).AND).toEqual([
          { OR: [{ user_id: null }, { user_id: { notIn: [7n] } }] },
        ]);
      });
    });
  });
});

describe('GuestSpeakersService behaviour', () => {
  const service = new GuestSpeakersService();
  afterEach(() => jest.restoreAllMocks());

  const row = {
    guest_id: 3n,
    user_id: 1n,
    first_name: 'Jane',
    last_name: 'Doe',
    bio: null,
    field: 'Cybersecurity',
    role: 'Principal Consultant',
    experience: 'Expert',
    prior_details: 'Keynote at a security conference',
    international_details: null,
    linkedIn_profile: 'https://linkedin.com/in/janedoe',
    profile_image_id: 12n,
    location: 'Perth',
    audience: '50-100',
    duration: '60',
    format_online: true,
    format_inperson: false,
    format_prerecorded: true,
    focus_lecture: true,
    focus_casestudy: false,
    focus_workshop: false,
    focus_discussion: false,
    focus_ama: true,
  };

  const engagement: EngagementDto = {
    primaryLocation: 'Perth',
    audienceSize: '50-100',
    deliveryFocus: ['Case Study', 'Discussion Lead'],
    sessionDuration: '60',
    format: 'online',
    formats: ['online', 'face-to-face'],
    schedule: {
      availableDays: ['monday', 'friday'],
      availableFrom: '09:30',
      availableTo: '',
      availabilityFrequency: 'monthly',
      availabilityNotes: '',
    },
  };

  describe('findByUserId', () => {
    it('returns null for a user with no guest profile, without creating anything', async () => {
      jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 1n } as never);
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue(null);
      const create = jest.spyOn(prisma.users, 'create');
      const upsert = jest.spyOn(prisma.users, 'upsert');
      const resolve = jest.spyOn(prismaModule, 'resolveUserId');

      await expect(service.findByUserId('auth0|jane')).resolves.toBeNull();

      expect(create).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('reads the profile of the subject it is given and nobody else', async () => {
      const users = jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 9n } as never);
      const guests = jest
        .spyOn(prisma.guests, 'findUnique')
        .mockResolvedValue(row as never);
      const expertise = jest.spyOn(prisma.user_expertise, 'findMany');
      const availability = jest.spyOn(prisma.availability, 'findFirst');

      await service.findByUserId('auth0|jane');

      expect(users.mock.calls[0][0]).toMatchObject({
        where: { auth0Id: 'auth0|jane' },
      });
      expect(guests).toHaveBeenCalledWith({ where: { user_id: 9n } });
      expect(expertise).toHaveBeenCalledWith({ where: { user_id: 9n } });
      expect(availability).toHaveBeenCalledWith({ where: { user_id: 9n } });
    });

    it('maps stored columns back to the profile the frontend expects', async () => {
      jest
        .spyOn(prisma.users, 'findUnique')
        .mockResolvedValue({ userid: 1n } as never);
      jest.spyOn(prisma.guests, 'findUnique').mockResolvedValue(row as never);
      jest
        .spyOn(prisma.user_expertise, 'findMany')
        .mockResolvedValue([{ user_id: 1n, expertise: 'Zero Trust' }] as never);
      jest.spyOn(prisma.availability, 'findFirst').mockResolvedValue({
        monday: true,
        tuesday: false,
        wednesday: false,
        thursday: true,
        friday: false,
        available_from: new Date('1970-01-01T09:30:00Z'),
        available_to: null,
        frequency: 'weekly',
        notes: null,
      } as never);

      const profile = await service.findByUserId('auth0|jane');

      expect(profile?.basicInformation).toMatchObject({
        fullName: 'Jane Doe',
        bio: '',
        photoPreview: '/api/backend/images/12',
      });
      expect(profile?.expertise).toMatchObject({
        selectedTopics: ['Zero Trust'],
        experienceLevel: 'Expert',
        hasSpeakingExperience: true,
        hasInternationalExperience: false,
        linkedin: 'https://linkedin.com/in/janedoe',
      });
      expect(profile?.engagementProfile).toMatchObject({
        formats: ['online', 'pre-recorded'],
        deliveryFocus: ['Seminar/Lecture', 'AMA Session'],
        schedule: {
          availableDays: ['monday', 'thursday'],
          availableFrom: '09:30',
          availableTo: '',
        },
      });
    });
  });

  describe('saving', () => {
    it('stores the experience level and speaking details on the guest row', async () => {
      const upsert = jest.spyOn(prisma.guests, 'upsert');
      const dto: ExpertiseDto = {
        selectedTopics: [],
        experienceLevel: 'Expert',
        hasSpeakingExperience: true,
        speakingDetails: 'Keynote speaker',
        hasInternationalExperience: true,
        internationalDetails: 'Toured Asia',
        linkedin: 'https://linkedin.com/in/janedoe',
      };

      await service.saveExpertise('auth0|jane', dto);

      const fields = {
        experience: 'Expert',
        prior_details: 'Keynote speaker',
        international_details: 'Toured Asia',
        linkedIn_profile: 'https://linkedin.com/in/janedoe',
      };
      expect(upsert).toHaveBeenCalledWith({
        where: { user_id: 1n },
        update: fields,
        create: { user_id: 1n, ...fields },
      });
    });

    it('marks consent for the caller only, and writes nothing else to the user', async () => {
      jest.spyOn(prismaModule, 'resolveUserId').mockResolvedValue(8n);
      const update = jest.spyOn(prisma.users, 'update');

      await service.saveConsent('auth0|jane', {
        profileMatchingConsent: true,
      } as ConsentDto);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 8n },
        data: { consentstate: true },
      });
    });

    it('does not store the photo preview sent with the basic information', async () => {
      const upsert = jest.spyOn(prisma.guests, 'upsert');

      await service.saveBasicInformation('auth0|jane', {
        fullName: 'Jane',
        bio: '',
        photoPreview: 'data:image/png;base64,AAAA',
        professionalField: 'Security',
        professionalRole: 'Consultant',
      });

      const written = upsert.mock.calls[0][0].update;
      expect(Object.keys(written).sort()).toEqual([
        'bio',
        'field',
        'first_name',
        'last_name',
        'role',
      ]);
      expect(written.last_name).toBeUndefined();
    });

    it('stores formats and delivery focus as flags, and times as UTC clock times', async () => {
      const upsert = jest.spyOn(prisma.guests, 'upsert');
      const create = jest.spyOn(prisma.availability, 'create');

      await service.saveEngagement('auth0|jane', engagement);

      expect(upsert.mock.calls[0][0].update).toMatchObject({
        format_online: true,
        format_inperson: true,
        format_prerecorded: false,
        focus_lecture: false,
        focus_casestudy: true,
        focus_workshop: false,
        focus_discussion: true,
        focus_ama: false,
      });
      expect(create.mock.calls[0][0].data).toMatchObject({
        user_id: 1n,
        monday: true,
        tuesday: false,
        friday: true,
        available_from: new Date('1970-01-01T09:30:00Z'),
        available_to: undefined,
      });
    });
  });

  describe('findAll', () => {
    it('lists each guest with their own topics and availability, and no account identifiers', async () => {
      jest
        .spyOn(prisma.guests, 'findMany')
        .mockResolvedValue([
          row,
          { ...row, guest_id: 4n, user_id: 2n, first_name: 'Sam' },
          { ...row, guest_id: 5n, user_id: null, first_name: 'Pat' },
        ] as never);
      jest.spyOn(prisma.user_expertise, 'findMany').mockResolvedValue([
        { user_id: 1n, expertise: 'Zero Trust' },
        { user_id: 2n, expertise: 'Privacy' },
      ] as never);
      jest
        .spyOn(prisma.availability, 'findMany')
        .mockResolvedValue([{ user_id: 2n, monday: true }] as never);

      const list = await service.findAll();

      expect(list.map((g) => g.id)).toEqual(['3', '4', '5']);
      expect(list.map((g) => g.expertise.selectedTopics)).toEqual([
        ['Zero Trust'],
        ['Privacy'],
        [],
      ]);
      expect(list[1].engagementProfile.schedule.availableDays).toEqual([
        'monday',
      ]);
      expect(list[0].engagementProfile.schedule.availableDays).toEqual([]);
      expect(Object.keys(list[0]).sort()).toEqual([
        'basicInformation',
        'consentPreferences',
        'engagementProfile',
        'expertise',
        'id',
      ]);
      expect(JSON.stringify(list)).not.toContain('auth0');
    });
  });
});
