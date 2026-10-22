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
import {
  MAX_HALF_LIFE_DAYS,
  MIN_FIT_WEIGHT_PERCENT,
  MIN_HALF_LIFE_DAYS,
} from '../../suggestions/matching-settings';

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

  /** Suggested speakers on or off. Off makes the route answer 404. */
  @IsOptional()
  @IsBoolean()
  suggestionsEnabled?: boolean;

  /**
   * The three ranking weights are whole percentages and must add up to 100;
   * the service checks the sum, because it depends on all three. Fit is at
   * least 50 so topic fit always counts most.
   */
  @IsOptional()
  @IsInt()
  @Min(MIN_FIT_WEIGHT_PERCENT)
  @Max(100)
  suggestionsFitWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  suggestionsRotationWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  suggestionsExposureWeight?: number;

  /** Days until the time since a lecturer's last session counts half. */
  @IsOptional()
  @IsInt()
  @Min(MIN_HALF_LIFE_DAYS)
  @Max(MAX_HALF_LIFE_DAYS)
  suggestionsHalfLifeDays?: number;
}
