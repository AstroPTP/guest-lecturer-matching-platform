import { Transform } from 'class-transformer';
import { IsString, IsArray, IsNotEmpty } from 'class-validator';
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
