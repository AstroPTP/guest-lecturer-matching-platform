import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

import { prisma } from '../prisma';

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

  saveConsent(userId: string, dto: ConsentDto): GuestSpeakerProfile {
    const profile = this.getOrCreate(userId);
    profile.consentPreferences = dto;
    return profile;
  }

  findAll(): GuestSpeakerProfile[] {
    return [...this.profiles.values()];
  }

  private async createNewGuestInDatabase(guestDTO: GuestSpeakerProfile)
  {
    const newUser = await prisma.guest.create({
            data: {
                guest_id: guestDTO.speakerId,
                user_id: guestDTO.userId,
                first_name: guestDTO.firstName, 
                last_name: guestDTO.lastName, 
                field: guestDTO.basicInformation?.professionalField, 
                role: guestDTO.basicInformation?.professionalRole, 
                bio: guestDTO.basicInformation?.bio, 
                prior_details: guestDTO.expertise?.speakingDetails, 
                international_details: guestDTO.expertise?.internationalDetails, 
                linkedin_profile: guestDTO.expertise?.linkedin, 
                location: guestDTO.engagementProfile?.primaryLocation, 
                duration: guestDTO.engagementProfile?.sessionDuration, 
                audience: guestDTO.engagementProfile?.audienceSize,
                format_online: guestDTO.engagementProfile?.formats?.includes("Online"),
                format_inperson: guestDTO.engagementProfile?.formats?.includes("Face-to-Face"),
                format_prerecorded: guestDTO.engagementProfile?.formats?.includes("Pre-recorded"),
                focus_lecture: guestDTO.engagementProfile?.deliveryFocus.includes("Seminar/Lecture"),
                focus_casestudy: guestDTO.engagementProfile?.deliveryFocus.includes("Case Study"),
                focus_workshop: guestDTO.engagementProfile?.deliveryFocus.includes("Interactive Workshop"),
                focus_discussion: guestDTO.engagementProfile?.deliveryFocus.includes("Discussion Lead"),
                focus_ama: guestDTO.engagementProfile?.deliveryFocus.includes("AMA Session")
            },
        });

    for (const topic of guestDTO.expertise?.selectedTopics ?? []) {
      await prisma.user_expertise.create({
          data: {
              userId: guestDTO.userId,
              expertise: topic
          }
      });
    }

    const availability = {
            monday: guestDTO.engagementProfile?.schedule.availableDays.includes("Monday"),
            tuesday: guestDTO.engagementProfile?.schedule.availableDays.includes("Tuesday"),
            wednesday: guestDTO.engagementProfile?.schedule.availableDays.includes("Wednesday"),
            thursday: guestDTO.engagementProfile?.schedule.availableDays.includes("Thursday"),
            friday: guestDTO.engagementProfile?.schedule.availableDays.includes("Friday")
        };
    
        const availableFrom = new Date(`1970-01-01T${guestDTO.engagementProfile?.schedule.availableFrom}:00`);
        const availableTo = new Date(`1970-01-01T${guestDTO.engagementProfile?.schedule.availableTo}:00`);
    
        await prisma.availability.create({
            data: {
                userId: guestDTO.userId,
                ...availability,
                available_from: availableFrom,
                available_to: availableTo,
                frequency: guestDTO.engagementProfile?.schedule.availabilityFrequency,
                notes: guestDTO.engagementProfile?.schedule.availabilityNotes
            }
        });
  }
}