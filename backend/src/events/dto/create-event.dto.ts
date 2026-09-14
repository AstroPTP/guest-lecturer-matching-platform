import { IsString, IsNotEmpty, IsDateString, IsIn } from 'class-validator';

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
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsIn(EVENT_FORMATS)
  format: 'face-to-face' | 'online' | 'pre-recorded';
}