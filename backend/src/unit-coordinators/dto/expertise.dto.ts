import { IsString, IsArray, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * The longest free text a coordinator can save for the two descriptions. The
 * profile form stops at 350 characters, so this is only a server-side ceiling:
 * it keeps one profile from carrying a very large value that is later read
 * into session titles and descriptions.
 */
export const MAX_EXPERTISE_TEXT_LENGTH = 2000;

export class ExpertiseDto {
  @IsArray()
  @IsString({ each: true })
  selectedTopics: string[];

  @IsArray()
  @IsString({ each: true })
  experienceLevelsRequired: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EXPERTISE_TEXT_LENGTH)
  industryRelevance: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EXPERTISE_TEXT_LENGTH)
  learningObjective: string;
}
