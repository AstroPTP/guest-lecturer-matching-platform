import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsString,
  IsArray,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import {
  IsExpertiseTopicList,
  MAX_TOPICS,
  tidyTopics,
} from '../../common/expertise-topics';

export class ExpertiseDto {
  @Transform(({ value }) => tidyTopics(value))
  @IsArray()
  @ArrayMaxSize(MAX_TOPICS)
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
