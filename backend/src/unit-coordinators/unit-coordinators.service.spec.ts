import { Test, TestingModule } from '@nestjs/testing';
import { UnitCoordinatorsService } from './unit-coordinators.service';
import * as prismaModule from '../prisma';
import { prisma } from '../prisma';

describe('UnitCoordinatorsService', () => {
  let service: UnitCoordinatorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UnitCoordinatorsService],
    }).compile();

    service = module.get<UnitCoordinatorsService>(UnitCoordinatorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('UnitCoordinatorsService behaviour', () => {
  const service = new UnitCoordinatorsService();
  afterEach(() => jest.restoreAllMocks());

  const row = {
    coordinator_id: 4n,
    user_id: 1n,
    first_name: 'Ann',
    last_name: 'Lee',
    bio: null,
    faculty: 'Business and Law',
    role: 'Lecturer',
    required_experience: 'senior,mid',
    discipline: 'Ethics',
    learning_objective: null,
    location: 'Bentley',
    audience: 'small',
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

  it('returns null for someone who has never saved a profile, without creating a user', async () => {
    jest.spyOn(prisma.users, 'findUnique').mockResolvedValue(null);
    const create = jest.spyOn(prisma.users, 'create');
    const upsert = jest.spyOn(prisma.users, 'upsert');
    // resolveUserId creates the user row if it is missing, so a read must not
    // go through it.
    const resolve = jest.spyOn(prismaModule, 'resolveUserId');

    await expect(service.findByUserId('auth0|new')).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('maps stored columns back to the profile the frontend expects', async () => {
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ userid: 1n } as never);
    jest
      .spyOn(prisma.coordinators, 'findUnique')
      .mockResolvedValue(row as never);
    jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([{ user_id: 1n, expertise: 'AI ethics' }] as never);
    jest.spyOn(prisma.availability, 'findFirst').mockResolvedValue({
      monday: true,
      tuesday: false,
      wednesday: true,
      thursday: false,
      friday: false,
      available_from: new Date('1970-01-01T09:30:00Z'),
      available_to: null,
      frequency: 'monthly',
      notes: null,
    } as never);

    const profile = await service.findByUserId('auth0|ann');

    expect(profile?.basicInformation.fullName).toBe('Ann Lee');
    expect(profile?.expertise.experienceLevelsRequired).toEqual([
      'senior',
      'mid',
    ]);
    expect(profile?.expertise.selectedTopics).toEqual(['AI ethics']);
    expect(profile?.engagementProfile.formats).toEqual([
      'online',
      'pre-recorded',
    ]);
    expect(profile?.engagementProfile.deliveryFocus).toEqual([
      'Seminar/Lecture',
      'AMA Session',
    ]);
    expect(profile?.engagementProfile.schedule).toMatchObject({
      preferredDays: ['monday', 'wednesday'],
      preferredFrom: '09:30',
      preferredTo: '',
    });
  });

  it('replaces the topic list rather than appending to it', async () => {
    jest.spyOn(prisma.coordinators, 'upsert').mockResolvedValue({} as never);
    const removed = jest.spyOn(prisma.user_expertise, 'deleteMany');
    const added = jest.spyOn(prisma.user_expertise, 'createMany');
    jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

    await service.saveExpertise('auth0|ann', {
      selectedTopics: ['Privacy', 'Governance'],
      experienceLevelsRequired: ['senior'],
      industryRelevance: 'Law',
      learningObjective: 'Apply ethics',
    });

    expect(removed).toHaveBeenCalledWith({ where: { user_id: 1n } });
    expect(added.mock.calls[0][0]).toEqual({
      data: [
        { user_id: 1n, expertise: 'Privacy' },
        { user_id: 1n, expertise: 'Governance' },
      ],
    });
  });

  it('writes nothing when the topic list is emptied, after clearing the old one', async () => {
    jest.spyOn(prisma.coordinators, 'upsert').mockResolvedValue({} as never);
    const removed = jest.spyOn(prisma.user_expertise, 'deleteMany');
    const added = jest.spyOn(prisma.user_expertise, 'createMany');
    jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

    await service.saveExpertise('auth0|ann', {
      selectedTopics: [],
      experienceLevelsRequired: [],
      industryRelevance: '',
      learningObjective: '',
    });

    expect(removed).toHaveBeenCalled();
    expect(added).not.toHaveBeenCalled();
  });

  it('marks the profile complete when consent is saved', async () => {
    const update = jest
      .spyOn(prisma.users, 'update')
      .mockResolvedValue({} as never);
    jest.spyOn(service, 'findByUserId').mockResolvedValue(null);

    await service.saveConsent('auth0|ann', {} as never);

    expect(update).toHaveBeenCalledWith({
      where: { userid: 1n },
      data: { consentstate: true },
    });
  });

  it('lists coordinators with two batched reads, not one pair per coordinator', async () => {
    jest
      .spyOn(prisma.coordinators, 'findMany')
      .mockResolvedValue([
        row,
        { ...row, coordinator_id: 5n, user_id: 2n },
        { ...row, coordinator_id: 6n, user_id: null },
      ] as never);
    const expertise = jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockResolvedValue([] as never);
    const availability = jest
      .spyOn(prisma.availability, 'findMany')
      .mockResolvedValue([] as never);

    const list = await service.findAll();

    expect(list.map((c) => c.id)).toEqual(['4', '5', '6']);
    expect(expertise).toHaveBeenCalledTimes(1);
    expect(availability).toHaveBeenCalledTimes(1);
    expect(expertise.mock.calls[0][0]).toEqual({
      where: { user_id: { in: [1n, 2n] } },
    });
  });
});
