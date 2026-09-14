import { Injectable } from '@nestjs/common';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

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
}
