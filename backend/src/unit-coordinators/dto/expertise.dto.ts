import { IsString, IsArray, IsNotEmpty } from 'class-validator';

export class ExpertiseDto {
  @IsArray()
  @IsString({ each: true })
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
