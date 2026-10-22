import {
  IsNumberString,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateReportDto {
  @IsNumberString({ no_symbols: true })
  reportedUserId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
