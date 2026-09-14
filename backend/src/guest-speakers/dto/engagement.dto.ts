import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleDto {
  @IsArray()
  @IsString({ each: true })
  availableDays: string[];

  @IsString()
  availableFrom: string;

  @IsString()
  availableTo: string;

  @IsString()
  availabilityFrequency: string;

  @IsString()
  availabilityNotes: string;
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

  @IsString()
  format: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule: ScheduleDto;
}
