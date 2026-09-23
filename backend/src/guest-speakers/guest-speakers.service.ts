import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import { prisma, resolveUserId, splitName } from '../prisma';

type GuestRow = NonNullable<Awaited<ReturnType<typeof prisma.guests.findUnique>>>;
type ExpertiseRows = Awaited<ReturnType<typeof prisma.user_expertise.findMany>>;
type AvailabilityRow = Awaited<ReturnType<typeof prisma.availability.findFirst>>;
@Injectable()
export class GuestSpeakersService {
  /**
   * The caller's profile, assembled from the `guests` row plus its related
   * `user_expertise` and `availability` rows, or null if they haven't saved
   * anything yet.
   */
  async findByUserId(auth0Id: string) {
    const userId = await resolveUserId(auth0Id);

    const guest = await prisma.guests.findUnique({
      where: { user_id: userId },
    });
    if (!guest) {
      return null;
    }

    const [expertiseRows, availability] = await Promise.all([
      prisma.user_expertise.findMany({ where: { user_id: userId } }),
      prisma.availability.findFirst({ where: { user_id: userId } }),
    ]);

    return this.toProfileDto(guest, expertiseRows, availability);
  }

  async saveBasicInformation(auth0Id: string, dto: BasicInformationDto) {
    const userId = await resolveUserId(auth0Id);
    const name = splitName(dto.fullName);

    // NOTE: photoPreview has no column on `guests` yet, so it isn't persisted.
    const fields = {
      first_name: name.first_name,
      last_name: name.last_name,
      field: dto.professionalField,
      role: dto.professionalRole,
      bio: dto.bio,
    };

    await prisma.guests.upsert({
      where: { user_id: userId },
      update: fields,
      create: { user_id: userId, ...fields },
    });

    return this.findByUserId(auth0Id);
  }

  async saveExpertise(auth0Id: string, dto: ExpertiseDto) {
    const userId = await resolveUserId(auth0Id);

    // NOTE: experienceLevel, hasSpeakingExperience and
    // hasInternationalExperience have no columns on `guests` yet, so only
    // prior_details, international_details and linkedIn_profile persist.
    const fields = {
      prior_details: dto.speakingDetails,
      international_details: dto.internationalDetails,
      linkedIn_profile: dto.linkedin,
    };

    await prisma.guests.upsert({
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

    const guestFields = {
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

    await prisma.guests.upsert({
      where: { user_id: userId },
      update: guestFields,
      create: { user_id: userId, ...guestFields },
    });

    const availableFrom = dto.schedule.availableFrom
      ? new Date(`1970-01-01T${dto.schedule.availableFrom}:00Z`)
      : undefined;
    const availableTo = dto.schedule.availableTo
      ? new Date(`1970-01-01T${dto.schedule.availableTo}:00Z`)
      : undefined;

    const availabilityData = {
      monday: dto.schedule.availableDays.includes('monday'),
      tuesday: dto.schedule.availableDays.includes('tuesday'),
      wednesday: dto.schedule.availableDays.includes('wednesday'),
      thursday: dto.schedule.availableDays.includes('thursday'),
      friday: dto.schedule.availableDays.includes('friday'),
      available_from: availableFrom,
      available_to: availableTo,
      frequency: dto.schedule.availabilityFrequency,
      notes: dto.schedule.availabilityNotes,
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
   * Consent has no table of its own yet (schema gap), so this doesn't
   * persist anything beyond what the earlier steps already saved. Kept as
   * its own endpoint so the frontend's four-step flow doesn't change shape.
   */
  async saveConsent(auth0Id: string, _dto: ConsentDto) {
    return this.findByUserId(auth0Id);
  }

  /**
   * Every guest speaker, from the database. What the discovery page lists.
   */
  async findAll() {
    return prisma.guests.findMany({ orderBy: { guest_id: 'asc' } });
  }

  private toProfileDto(
    guest: GuestRow,
    expertiseRows: ExpertiseRows,
    availability: AvailabilityRow | null,
  ) {
    const formats: string[] = [];
    if (guest.format_online) formats.push('online');
    if (guest.format_inperson) formats.push('face-to-face');
    if (guest.format_prerecorded) formats.push('pre-recorded');

    const deliveryFocus: string[] = [];
    if (guest.focus_lecture) deliveryFocus.push('Seminar/Lecture');
    if (guest.focus_casestudy) deliveryFocus.push('Case Study');
    if (guest.focus_workshop) deliveryFocus.push('Interactive Workshop');
    if (guest.focus_discussion) deliveryFocus.push('Discussion Lead');
    if (guest.focus_ama) deliveryFocus.push('AMA Session');

    const availableDays: string[] = [];
    if (availability?.monday) availableDays.push('monday');
    if (availability?.tuesday) availableDays.push('tuesday');
    if (availability?.wednesday) availableDays.push('wednesday');
    if (availability?.thursday) availableDays.push('thursday');
    if (availability?.friday) availableDays.push('friday');

    return {
      basicInformation: {
        fullName: [guest.first_name, guest.last_name]
          .filter(Boolean)
          .join(' '),
        bio: guest.bio ?? '',
        photoPreview: '', // not persisted yet (schema gap)
        professionalField: guest.field ?? '',
        professionalRole: guest.role ?? '',
      },
      expertise: {
        selectedTopics: expertiseRows.map((row) => row.expertise),
        experienceLevel: '', // not persisted yet (schema gap)
        hasSpeakingExperience: Boolean(guest.prior_details),
        speakingDetails: guest.prior_details ?? '',
        hasInternationalExperience: Boolean(guest.international_details),
        internationalDetails: guest.international_details ?? '',
        linkedin: guest.linkedIn_profile ?? '',
      },
      engagementProfile: {
        primaryLocation: guest.location ?? '',
        audienceSize: guest.audience ?? '',
        deliveryFocus,
        sessionDuration: guest.duration ?? '',
        format: formats.join(', '),
        formats,
        schedule: {
          availableDays,
          availableFrom: formatTime(availability?.available_from),
          availableTo: formatTime(availability?.available_to),
          availabilityFrequency: availability?.frequency ?? '',
          availabilityNotes: availability?.notes ?? '',
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