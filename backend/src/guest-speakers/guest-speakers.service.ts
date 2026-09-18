import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

import { prisma, resolveUserId, splitName } from '../prisma';

export interface GuestSpeakerProfile {
  userId: string;
  basicInformation?: BasicInformationDto;
  expertise?: ExpertiseDto;
  engagementProfile?: EngagementDto;
  consentPreferences?: ConsentDto;
}

@Injectable()
export class GuestSpeakersService {
  private profiles = new Map<string, GuestSpeakerProfile>();

  private getOrCreate(userId: string): GuestSpeakerProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = { userId };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  findByUserId(userId: string): GuestSpeakerProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  saveBasicInformation(
    userId: string,
    dto: BasicInformationDto,
  ): GuestSpeakerProfile {
    const profile = this.getOrCreate(userId);
    profile.basicInformation = dto;
    return profile;
  }

  saveExpertise(userId: string, dto: ExpertiseDto): GuestSpeakerProfile {
    const profile = this.getOrCreate(userId);
    profile.expertise = dto;
    return profile;
  }

  saveEngagement(userId: string, dto: EngagementDto): GuestSpeakerProfile {
    const profile = this.getOrCreate(userId);
    profile.engagementProfile = dto;
    return profile;
  }

  /**
   * Saves consent, which is the last step of the profile form, and persists the
   * assembled profile.
   *
   * The earlier steps collect into memory because the form is filled in over
   * several requests. Consent is the point the person has finished and agreed,
   * so it is the point the profile becomes a row.
   */
  async saveConsent(
    userId: string,
    dto: ConsentDto,
  ): Promise<GuestSpeakerProfile> {
    const profile = this.getOrCreate(userId);
    profile.consentPreferences = dto;
    await this.createNewGuestInDatabase(profile);
    return profile;
  }

  /**
   * Every guest speaker, from the database.
   *
   * This is what the discovery page lists, so it has to be the stored rows
   * rather than whatever happens to be in this process's memory. Retrieving
   * from the database was the step the client was told was outstanding.
   */
  async findAll() {
    return prisma.guests.findMany({ orderBy: { guest_id: 'asc' } });
  }

  private async createNewGuestInDatabase(guestDTO: GuestSpeakerProfile) {
    const userId = await resolveUserId(guestDTO.userId);
    const name = splitName(guestDTO.basicInformation?.fullName);

    await prisma.guests.create({
      data: {
        user_id: userId,
        first_name: name.first_name,
        last_name: name.last_name,
        field: guestDTO.basicInformation?.professionalField,
        role: guestDTO.basicInformation?.professionalRole,
        bio: guestDTO.basicInformation?.bio,
        prior_details: guestDTO.expertise?.speakingDetails,
        international_details: guestDTO.expertise?.internationalDetails,
        linkedIn_profile: guestDTO.expertise?.linkedin,
        location: guestDTO.engagementProfile?.primaryLocation,
        duration: guestDTO.engagementProfile?.sessionDuration,
        audience: guestDTO.engagementProfile?.audienceSize,
        format_online: guestDTO.engagementProfile?.formats?.includes('Online'),
        format_inperson:
          guestDTO.engagementProfile?.formats?.includes('Face-to-Face'),
        format_prerecorded:
          guestDTO.engagementProfile?.formats?.includes('Pre-recorded'),
        focus_lecture:
          guestDTO.engagementProfile?.deliveryFocus.includes('Seminar/Lecture'),
        focus_casestudy:
          guestDTO.engagementProfile?.deliveryFocus.includes('Case Study'),
        focus_workshop: guestDTO.engagementProfile?.deliveryFocus.includes(
          'Interactive Workshop',
        ),
        focus_discussion:
          guestDTO.engagementProfile?.deliveryFocus.includes('Discussion Lead'),
        focus_ama:
          guestDTO.engagementProfile?.deliveryFocus.includes('AMA Session'),
      },
    });

    for (const topic of guestDTO.expertise?.selectedTopics ?? []) {
      await prisma.user_expertise.create({
        data: {
          user_id: userId,
          expertise: topic,
        },
      });
    }

    const availability = {
      monday:
        guestDTO.engagementProfile?.schedule.availableDays.includes('Monday'),
      tuesday:
        guestDTO.engagementProfile?.schedule.availableDays.includes('Tuesday'),
      wednesday:
        guestDTO.engagementProfile?.schedule.availableDays.includes(
          'Wednesday',
        ),
      thursday:
        guestDTO.engagementProfile?.schedule.availableDays.includes('Thursday'),
      friday:
        guestDTO.engagementProfile?.schedule.availableDays.includes('Friday'),
    };

    const availableFrom = new Date(
      `1970-01-01T${guestDTO.engagementProfile?.schedule.availableFrom}:00`,
    );
    const availableTo = new Date(
      `1970-01-01T${guestDTO.engagementProfile?.schedule.availableTo}:00`,
    );

    await prisma.availability.create({
      data: {
        user_id: userId,
        ...availability,
        available_from: availableFrom,
        available_to: availableTo,
        frequency: guestDTO.engagementProfile?.schedule.availabilityFrequency,
        notes: guestDTO.engagementProfile?.schedule.availabilityNotes,
      },
    });
  }
}
