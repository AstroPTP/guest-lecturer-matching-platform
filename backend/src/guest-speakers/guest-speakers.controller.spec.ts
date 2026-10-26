import { Test, TestingModule } from '@nestjs/testing';
import { GuestSpeakersController } from './guest-speakers.controller';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { ConsentDto } from './dto/consent.dto';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';

describe('GuestSpeakersController', () => {
  let controller: GuestSpeakersController;
  let service: GuestSpeakersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestSpeakersController],
      providers: [GuestSpeakersService],
    }).compile();

    service = module.get<GuestSpeakersService>(GuestSpeakersService);
    controller = module.get<GuestSpeakersController>(GuestSpeakersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('lists guest lecturers as seen by the person asking, so a report between them applies', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);

    await controller.findAll({ id: 'auth0|viewer', roles: [] });

    expect(findAll).toHaveBeenCalledWith('auth0|viewer', undefined);
  });

  it('passes the chosen sort on, and none when none was chosen', async () => {
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue([]);
    const viewer = { id: 'auth0|viewer', roles: [] };

    await controller.findAll(viewer, { sort: 'name' });
    await controller.findAll(viewer, {});

    expect(findAll).toHaveBeenNthCalledWith(1, 'auth0|viewer', 'name');
    expect(findAll).toHaveBeenNthCalledWith(2, 'auth0|viewer', undefined);
  });
});

describe('GuestSpeakersController behaviour', () => {
  const service = new GuestSpeakersService();
  const controller = new GuestSpeakersController(service);
  const user: AuthenticatedUser = { id: 'auth0|jane', roles: [] };
  afterEach(() => jest.restoreAllMocks());

  // The caller's id comes from the verified token, never the request, so
  // every route must pass user.id through rather than anything from the body.
  it('acts as the signed-in user on every profile route, including the speaker list, which depends on who is asking', async () => {
    const find = jest.spyOn(service, 'findByUserId').mockResolvedValue(null);
    const basic = jest
      .spyOn(service, 'saveBasicInformation')
      .mockResolvedValue(null);
    const expertise = jest
      .spyOn(service, 'saveExpertise')
      .mockResolvedValue(null);
    const engagement = jest
      .spyOn(service, 'saveEngagement')
      .mockResolvedValue(null);
    const consent = jest.spyOn(service, 'saveConsent').mockResolvedValue(null);
    const list = jest.spyOn(service, 'findAll').mockResolvedValue([]);
    const dto = {} as never;

    await controller.findMine(user);
    await controller.saveBasicInformation(dto, user);
    await controller.saveExpertise(dto, user);
    await controller.saveEngagement(dto, user);
    await controller.saveConsent(dto, user);
    await expect(controller.findAll(user)).resolves.toEqual([]);

    expect(find).toHaveBeenCalledWith('auth0|jane');
    expect(basic).toHaveBeenCalledWith('auth0|jane', dto);
    expect(expertise).toHaveBeenCalledWith('auth0|jane', dto);
    expect(engagement).toHaveBeenCalledWith('auth0|jane', dto);
    expect(consent).toHaveBeenCalledWith('auth0|jane', dto);
    expect(list).toHaveBeenCalledWith('auth0|jane', undefined);
  });

  describe('request validation', () => {
    // The same options the application applies to every request body.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const body = (metatype: ArgumentMetadata['metatype']) =>
      ({ type: 'body', metatype }) as ArgumentMetadata;

    it('refuses an expertise update with no experience level, since it is stored', async () => {
      const dto: ExpertiseDto = {
        selectedTopics: [],
        experienceLevel: '',
        hasSpeakingExperience: false,
        speakingDetails: '',
        hasInternationalExperience: false,
        internationalDetails: '',
        linkedin: '',
      };

      await expect(
        pipe.transform(dto, body(ExpertiseDto)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a profile body that tries to set fields it does not own', async () => {
      const basic: BasicInformationDto = {
        fullName: 'Jane Doe',
        bio: '',
        photoPreview: '',
        professionalField: 'Security',
        professionalRole: 'Consultant',
      };

      await expect(
        pipe.transform(basic, body(BasicInformationDto)),
      ).resolves.toMatchObject(basic);
      await expect(
        pipe.transform(
          { ...basic, user_id: 2, profile_image_id: 9 },
          body(BasicInformationDto),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform({ profileMatchingConsent: 'yes' }, body(ConsentDto)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
