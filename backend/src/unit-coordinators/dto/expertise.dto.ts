import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsString, IsArray, IsNotEmpty } from 'class-validator';
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

  @IsArray()
  @IsString({ each: true })
  experienceLevelsRequired: string[];

  @IsString()
  @IsNotEmpty()
  industryRelevance: string;

  @IsString()
  @IsNotEmpty()
  learningObjective: string;
}
