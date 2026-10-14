import { IsBoolean, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ConsentDto {
  @IsBoolean()
  detailsMatchingConsent: boolean;

  @IsBoolean()
  informationAccurate: boolean;

  @IsBoolean()
  receiveUpdates: boolean;

  @IsBoolean()
  useWithinAgreedScope: boolean;

  @IsBoolean()
  noExternalRedistribution: boolean;

  @IsBoolean()
  studentPrivacyCompliance: boolean;

  @IsBoolean()
  termsAccepted: boolean;

  // Nothing collects or reads this yet; optional so the consent form can be
  // submitted without inventing a value for it.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requestStatus?: string;
}
