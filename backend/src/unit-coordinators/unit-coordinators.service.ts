import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

import { prisma } from '../prisma';

export interface UnitCoordinatorProfile {
  userId: string;
  basicInformation?: BasicInformationDto;
  expertise?: ExpertiseDto;
  engagementProfile?: EngagementDto;
  consentPreferences?: ConsentDto;
}

@Injectable()
export class UnitCoordinatorsService {
  private profiles = new Map<string, UnitCoordinatorProfile>();

  private getOrCreate(userId: string): UnitCoordinatorProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = { userId };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  findByUserId(userId: string): UnitCoordinatorProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  saveBasicInformation(
    userId: string,
    dto: BasicInformationDto,
  ): UnitCoordinatorProfile {
    const profile = this.getOrCreate(userId);
    profile.basicInformation = dto;
    return profile;
  }

  saveExpertise(userId: string, dto: ExpertiseDto): UnitCoordinatorProfile {
    const profile = this.getOrCreate(userId);
    profile.expertise = dto;
    return profile;
  }

  saveEngagement(userId: string, dto: EngagementDto): UnitCoordinatorProfile {
    const profile = this.getOrCreate(userId);
    profile.engagementProfile = dto;
    return profile;
  }

  saveConsent(userId: string, dto: ConsentDto): UnitCoordinatorProfile {
    const profile = this.getOrCreate(userId);
    profile.consentPreferences = dto;
    return profile;
  }

  findAll(): UnitCoordinatorProfile[] {
    return [...this.profiles.values()];
  }

  private async createNewCoordinatorInDatabase(
    coordinatorDTO: UnitCoordinatorProfile,
  ) {
    await prisma.coordinator.create({
      data: {
        guest_id: coordinatorDTO.speakerId,
        user_id: coordinatorDTO.userId,
        first_name: coordinatorDTO.firstName,
        last_name: coordinatorDTO.lastName,
        faculty: coordinatorDTO.basicInformation?.schoolDepartment,
        role: coordinatorDTO.basicInformation?.academicRole,
        bio: coordinatorDTO.basicInformation?.bio,
        learning_objective: coordinatorDTO.expertise?.learningObjective,
        discipline: coordinatorDTO.expertise?.industryRelevance,
        experience: coordinatorDTO.expertise?.experienceLevelsRequired,
        location: coordinatorDTO.engagementProfile?.primaryLocation,
        duration: coordinatorDTO.engagementProfile?.sessionDuration,
        audience: coordinatorDTO.engagementProfile?.audienceSize,
        format_online:
          coordinatorDTO.engagementProfile?.formats?.includes('Online'),
        format_inperson:
          coordinatorDTO.engagementProfile?.formats?.includes('Face-to-Face'),
        format_prerecorded:
          coordinatorDTO.engagementProfile?.formats?.includes('Pre-recorded'),
        focus_lecture:
          coordinatorDTO.engagementProfile?.deliveryFocus.includes(
            'Seminar/Lecture',
          ),
        focus_casestudy:
          coordinatorDTO.engagementProfile?.deliveryFocus.includes(
            'Case Study',
          ),
        focus_workshop:
          coordinatorDTO.engagementProfile?.deliveryFocus.includes(
            'Interactive Workshop',
          ),
        focus_discussion:
          coordinatorDTO.engagementProfile?.deliveryFocus.includes(
            'Discussion Lead',
          ),
        focus_ama:
          coordinatorDTO.engagementProfile?.deliveryFocus.includes(
            'AMA Session',
          ),
      },
    });

    for (const topic of coordinatorDTO.expertise?.selectedTopics ?? []) {
      await prisma.user_expertise.create({
        data: {
          user_id: coordinatorDTO.userId,
          expertise: topic,
        },
      });
    }

    const availability = {
      monday:
        coordinatorDTO.engagementProfile?.schedule.preferredDays.includes(
          'Monday',
        ),
      tuesday:
        coordinatorDTO.engagementProfile?.schedule.preferredDays.includes(
          'Tuesday',
        ),
      wednesday:
        coordinatorDTO.engagementProfile?.schedule.preferredDays.includes(
          'Wednesday',
        ),
      thursday:
        coordinatorDTO.engagementProfile?.schedule.preferredDays.includes(
          'Thursday',
        ),
      friday:
        coordinatorDTO.engagementProfile?.schedule.preferredDays.includes(
          'Friday',
        ),
    };

    const availableFrom = new Date(
      `1970-01-01T${coordinatorDTO.engagementProfile?.schedule.preferredFrom}:00`,
    );
    const availableTo = new Date(
      `1970-01-01T${coordinatorDTO.engagementProfile?.schedule.preferredTo}:00`,
    );

    await prisma.availability.create({
      data: {
        user_id: coordinatorDTO.userId,
        ...availability,
        available_from: availableFrom,
        available_to: availableTo,
        frequency:
          coordinatorDTO.engagementProfile?.schedule.engagementFrequency,
        notes: coordinatorDTO.engagementProfile?.schedule.scheduleNotes,
      },
    });
  }
}
