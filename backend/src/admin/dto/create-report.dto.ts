import {
  IsNumberString,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Two ways to name the person being reported; send exactly one.
 *
 * `targetId` is the other person's profile id (guest_id or coordinator_id),
 * the only id the apps know. The server works out who they are and checks
 * they are in an accepted match with the reporter.
 *
 * `reportedUserId` is a users.userid and is not checked against any match.
 *
 * Each id is validated only while the other is absent, so a body that names
 * neither fails on both, and a body that names both is refused by the service
 * before either is used.
 */
export class CreateReportDto {
  @ValidateIf((body: CreateReportDto) => body.targetId === undefined)
  @IsNumberString({ no_symbols: true })
  reportedUserId?: string;

  @ValidateIf((body: CreateReportDto) => body.reportedUserId === undefined)
  @IsNumberString({ no_symbols: true })
  targetId?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
