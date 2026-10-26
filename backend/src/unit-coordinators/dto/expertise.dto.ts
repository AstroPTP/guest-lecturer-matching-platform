import { IsString, IsArray, IsNotEmpty } from 'class-validator';

import { MaxExpertiseText } from './expertise-text-limit';

export class ExpertiseDto {
  @IsArray()
  @IsString({ each: true })
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
