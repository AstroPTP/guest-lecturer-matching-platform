import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsIn,
  Matches,
} from 'class-validator';

/** A 24-hour time of day, as the browser's time field writes it. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const EVENT_FORMATS = ['face-to-face', 'online', 'pre-recorded'] as const;

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsString()
  @IsNotEmpty()
  coordinatorName: string;

  @IsString()
  @IsNotEmpty()
  guestLecturerId: string;

  @IsString()
  @IsNotEmpty()
  guestLecturerName: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be written YYYY-MM-DD',
  })
  date: string;

  @Matches(TIME_PATTERN, { message: 'startTime must be a time written HH:MM' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be a time written HH:MM' })
  endTime: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsIn(EVENT_FORMATS)
  format: 'face-to-face' | 'online' | 'pre-recorded';
}
