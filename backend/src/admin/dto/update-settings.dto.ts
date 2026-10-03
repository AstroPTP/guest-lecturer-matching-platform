import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Every field optional: a patch changes what it names and nothing else. */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  systemName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'supportEmail must be an email address' })
  supportEmail?: string;

  @IsOptional()
  @IsBoolean()
  requireAdminApproval?: boolean;

  /** 0 turns the contact limit off; a year is the most it can be set to. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  contactLimitDays?: number;
}
