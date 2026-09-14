import { IsBoolean, IsString, IsNotEmpty } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  requestStatus: string;
}