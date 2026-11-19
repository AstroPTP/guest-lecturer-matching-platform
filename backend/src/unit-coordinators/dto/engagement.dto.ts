import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleDto {
  @IsArray()
  @IsString({ each: true })
  preferredDays: string[];

  @IsString()
  preferredFrom: string;

  @IsString()
  preferredTo: string;

  @IsString()
  engagementFrequency: string;

  @IsString()
  scheduleNotes: string;
}

export class EngagementDto {
  @IsString()
  primaryLocation: string;

  @IsString()
  audienceSize: string;

  @IsArray()
  @IsString({ each: true })
  deliveryFocus: string[];

  @IsString()
  sessionDuration: string;

  @IsArray()
  @IsString({ each: true })
  formats: string[];

  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule: ScheduleDto;
}
