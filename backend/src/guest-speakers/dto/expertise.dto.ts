import { Transform } from 'class-transformer';
import { IsString, IsArray, IsBoolean, IsNotEmpty } from 'class-validator';
import {
  IsExpertiseTopicList,
  tidyTopics,
} from '../../common/expertise-topics';

export class ExpertiseDto {
  @Transform(({ value }) => tidyTopics(value))
  @IsArray()
  @IsString({ each: true })
  @IsExpertiseTopicList()
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
