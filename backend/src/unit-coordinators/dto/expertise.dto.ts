import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsString, IsArray, IsNotEmpty } from 'class-validator';
import {
  IsExpertiseTopicList,
  MAX_TOPICS,
  tidyTopics,
} from '../../common/expertise-topics';

import { MaxExpertiseText } from './expertise-text-limit';

export class ExpertiseDto {
  @Transform(({ value }) => tidyTopics(value))
  @IsArray()
  @ArrayMaxSize(MAX_TOPICS)
  @IsString({ each: true })
  @IsExpertiseTopicList()
  selectedTopics: string[];

  @IsArray()
  @IsString({ each: true })
  experienceLevelsRequired: string[];

  @IsString()
  @IsNotEmpty()
  @MaxExpertiseText()
  industryRelevance: string;

  @IsString()
  @IsNotEmpty()
  @MaxExpertiseText()
  learningObjective: string;
}
