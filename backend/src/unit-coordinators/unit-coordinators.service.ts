import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import { prisma, resolveUserId, splitName } from '../prisma';
import { profileImageUrl } from '../images/images.service';

type CoordinatorRow = NonNullable<
  Awaited<ReturnType<typeof prisma.coordinators.findUnique>>
>;
type ExpertiseRows = Awaited<ReturnType<typeof prisma.user_expertise.findMany>>;
type AvailabilityRow = Awaited<
  ReturnType<typeof prisma.availability.findFirst>
>;

@Injectable()
export class UnitCoordinatorsService {
  /**
   * The caller's profile, assembled from the `coordinators` row plus its
   * related `user_expertise` and `availability` rows, or null if they
   * haven't saved anything yet.
   */
  async findByUserId(auth0Id: string) {
    const userId = await resolveUserId(auth0Id);

    const coordinator = await prisma.coordinators.findUnique({
      where: { user_id: userId },
    });
    if (!coordinator) {
      return null;
    }

    const [expertiseRows, availability] = await Promise.all([
      prisma.user_expertise.findMany({ where: { user_id: userId } }),
      prisma.availability.findFirst({ where: { user_id: userId } }),
    ]);

    return this.toProfileDto(coordinator, expertiseRows, availability);
  }

  async saveBasicInformation(auth0Id: string, dto: BasicInformationDto) {
    const userId = await resolveUserId(auth0Id);
    const name = splitName(dto.fullName);

    const fields = {
      first_name: name.first_name,
      last_name: name.last_name,
      faculty: dto.schoolDepartment,
      role: dto.academicRole,
      bio: dto.bio,
    };

    await prisma.coordinators.upsert({
      where: { user_id: userId },
      update: fields,
      create: { user_id: userId, ...fields },
    });

    return this.findByUserId(auth0Id);
  }

  async saveExpertise(auth0Id: string, dto: ExpertiseDto) {
    const userId = await resolveUserId(auth0Id);

    // NOTE: experienceLevelsRequired has no matching column on `coordinators`
    // (`experience` is a single Int?, the form collects a string list), so
    // only discipline and learning_objective persist.
    const fields = {
      discipline: dto.industryRelevance,
      learning_objective: dto.learningObjective,
    };

    await prisma.coordinators.upsert({
      where: { user_id: userId },
      update: fields,
      create: { user_id: userId, ...fields },
    });

    // Replace the topic list wholesale rather than diffing it.
    await prisma.user_expertise.deleteMany({ where: { user_id: userId } });
    if (dto.selectedTopics.length > 0) {
      await prisma.user_expertise.createMany({
        data: dto.selectedTopics.map((expertise) => ({
          user_id: userId,
          expertise,
        })),
      });
    }

    return this.findByUserId(auth0Id);
  }

  async saveEngagement(auth0Id: string, dto: EngagementDto) {
    const userId = await resolveUserId(auth0Id);
    const formats = dto.formats ?? [];

    const coordinatorFields = {
      location: dto.primaryLocation,
      duration: dto.sessionDuration,
      audience: dto.audienceSize,
      format_online: formats.includes('online'),
      format_inperson: formats.includes('face-to-face'),
      format_prerecorded: formats.includes('pre-recorded'),
      focus_lecture: dto.deliveryFocus.includes('Seminar/Lecture'),
      focus_casestudy: dto.deliveryFocus.includes('Case Study'),
      focus_workshop: dto.deliveryFocus.includes('Interactive Workshop'),
      focus_discussion: dto.deliveryFocus.includes('Discussion Lead'),
      focus_ama: dto.deliveryFocus.includes('AMA Session'),
    };

    await prisma.coordinators.upsert({
      where: { user_id: userId },
      update: coordinatorFields,
      create: { user_id: userId, ...coordinatorFields },
    });

    const availableFrom = dto.schedule.preferredFrom
      ? new Date(`1970-01-01T${dto.schedule.preferredFrom}:00Z`)
      : undefined;
    const availableTo = dto.schedule.preferredTo
      ? new Date(`1970-01-01T${dto.schedule.preferredTo}:00Z`)
      : undefined;

    const availabilityData = {
      monday: dto.schedule.preferredDays.includes('monday'),
      tuesday: dto.schedule.preferredDays.includes('tuesday'),
      wednesday: dto.schedule.preferredDays.includes('wednesday'),
      thursday: dto.schedule.preferredDays.includes('thursday'),
      friday: dto.schedule.preferredDays.includes('friday'),
      available_from: availableFrom,
      available_to: availableTo,
      frequency: dto.schedule.engagementFrequency,
      notes: dto.schedule.scheduleNotes,
    };

    const existingAvailability = await prisma.availability.findFirst({
      where: { user_id: userId },
    });

    if (existingAvailability) {
      await prisma.availability.update({
        where: { id: existingAvailability.id },
        data: availabilityData,
      });
    } else {
      await prisma.availability.create({
        data: { user_id: userId, ...availabilityData },
      });
    }

    return this.findByUserId(auth0Id);
  }

  /**
   * The last step of the setup wizard. Consent has no table of its own yet
   * (schema gap), so the individual answers aren't stored; what is stored is
   * `users.consentstate`, which marks the profile as complete so a returning
   * user is sent to the dashboard instead of back through the wizard.
   */
  async saveConsent(auth0Id: string, _dto: ConsentDto) {
    const userId = await resolveUserId(auth0Id);

    await prisma.users.update({
      where: { userid: userId },
      data: { consentstate: true },
    });

    return this.findByUserId(auth0Id);
  }

  /**
   * Every unit coordinator, from the database. What the discovery page lists.
   */
  async findAll() {
    const coordinators = await prisma.coordinators.findMany({
      orderBy: { coordinator_id: 'asc' },
    });
    const userIds = coordinators.flatMap((coordinator) =>
      coordinator.user_id === null ? [] : [coordinator.user_id],
    );

    // Two batched reads rather than one pair per coordinator.
    const [expertiseRows, availabilityRows] = await Promise.all([
      prisma.user_expertise.findMany({ where: { user_id: { in: userIds } } }),
      prisma.availability.findMany({ where: { user_id: { in: userIds } } }),
    ]);

    return coordinators.map((coordinator) => {
      const hasUser = coordinator.user_id !== null;
      return {
        id: String(coordinator.coordinator_id),
        ...this.toProfileDto(
          coordinator,
          hasUser
            ? expertiseRows.filter((row) => row.user_id === coordinator.user_id)
            : [],
          hasUser
            ? (availabilityRows.find(
                (row) => row.user_id === coordinator.user_id,
              ) ?? null)
            : null,
        ),
      };
    });
  }

  private toProfileDto(
    coordinator: CoordinatorRow,
    expertiseRows: ExpertiseRows,
    availability: AvailabilityRow | null,
  ) {
    const formats: string[] = [];
    if (coordinator.format_online) formats.push('online');
    if (coordinator.format_inperson) formats.push('face-to-face');
    if (coordinator.format_prerecorded) formats.push('pre-recorded');

    const deliveryFocus: string[] = [];
    if (coordinator.focus_lecture) deliveryFocus.push('Seminar/Lecture');
    if (coordinator.focus_casestudy) deliveryFocus.push('Case Study');
    if (coordinator.focus_workshop) deliveryFocus.push('Interactive Workshop');
    if (coordinator.focus_discussion) deliveryFocus.push('Discussion Lead');
    if (coordinator.focus_ama) deliveryFocus.push('AMA Session');

    const preferredDays: string[] = [];
    if (availability?.monday) preferredDays.push('monday');
    if (availability?.tuesday) preferredDays.push('tuesday');
    if (availability?.wednesday) preferredDays.push('wednesday');
    if (availability?.thursday) preferredDays.push('thursday');
    if (availability?.friday) preferredDays.push('friday');

    return {
      basicInformation: {
        fullName: [coordinator.first_name, coordinator.last_name]
          .filter(Boolean)
          .join(' '),
        bio: coordinator.bio ?? '',
        photoPreview: profileImageUrl(coordinator.profile_image_id),
        schoolDepartment: coordinator.faculty ?? '',
        academicRole: coordinator.role ?? '',
      },
      expertise: {
        selectedTopics: expertiseRows.map((row) => row.expertise),
        experienceLevelsRequired: [], // not persisted yet (schema gap)
        industryRelevance: coordinator.discipline ?? '',
        learningObjective: coordinator.learning_objective ?? '',
      },
      engagementProfile: {
        primaryLocation: coordinator.location ?? '',
        audienceSize: coordinator.audience ?? '',
        deliveryFocus,
        sessionDuration: coordinator.duration ?? '',
        formats,
        schedule: {
          preferredDays,
          preferredFrom: formatTime(availability?.available_from),
          preferredTo: formatTime(availability?.available_to),
          engagementFrequency: availability?.frequency ?? '',
          scheduleNotes: availability?.notes ?? '',
        },
      },
      consentPreferences: undefined, // not persisted yet (schema gap)
    };
  }
}

function formatTime(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(11, 16); // "HH:MM"
}
