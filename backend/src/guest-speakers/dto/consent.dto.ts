import { IsBoolean } from 'class-validator';

export class ConsentDto {
  @IsBoolean()
  profileMatchingConsent: boolean;

  @IsBoolean()
  informationAccurate: boolean;

  @IsBoolean()
  receiveUpdates: boolean;

  @IsBoolean()
  futureTeachingReuse: boolean;

  @IsBoolean()
  otherUnitsReuse: boolean;

  @IsBoolean()
  timeLimitedUse: boolean;

  @IsBoolean()
  termsAccepted: boolean;
}
