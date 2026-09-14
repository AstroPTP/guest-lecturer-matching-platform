import { IsString, IsArray, IsBoolean, IsNotEmpty } from 'class-validator';

export class ExpertiseDto {
  @IsArray()
  @IsString({ each: true })
  selectedTopics: string[];

  @IsString()
  @IsNotEmpty()
  experienceLevel: string;

  @IsBoolean()
  hasSpeakingExperience: boolean;

  @IsString()
  speakingDetails: string;

  @IsBoolean()
  hasInternationalExperience: boolean;

  @IsString()
  internationalDetails: string;

  @IsString()
  linkedin: string;
}
