import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Most topics one request may name, and the longest one topic may be. */
export const MAX_TOPICS = 10;
export const MAX_TOPIC_LENGTH = 80;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

/**
 * Accepts `topics=A&topics=B` and `topics=A,B`, and gives back one clean list.
 * No topic in the profile options contains a comma, so splitting on it is safe.
 */
function toTopicList(value: unknown): unknown {
  const parts: unknown[] = Array.isArray(value) ? value : [value];
  const strings = parts.filter(
    (part): part is string => typeof part === 'string',
  );
  if (strings.length !== parts.length) {
    return value;
  }
  return strings
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * The session a coordinator wants speakers for. Which coordinator is asking
 * comes from the token and never from here.
 */
export class SuggestionsQueryDto {
  /** The day of the session, YYYY-MM-DD. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** 24-hour HH:MM. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be HH:MM in 24-hour time',
  })
  startTime: string;

  /** 24-hour HH:MM, later than startTime. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be HH:MM in 24-hour time',
  })
  endTime: string;

  /** The topics the session needs. At least one lecturer topic must match. */
  @Transform(({ value }) => toTopicList(value))
  @IsArray()
  @ArrayMinSize(1, { message: 'name at least one topic' })
  @ArrayMaxSize(MAX_TOPICS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TOPIC_LENGTH, { each: true })
  topics: string[];

  /** How many suggestions to return, best first. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}
