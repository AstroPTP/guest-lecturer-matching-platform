import {
  IsNumberString,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A report about the person on the other side of an accepted match.
 *
 * `targetId` is the other person's profile id (guest_id or coordinator_id),
 * the only id the apps know. The server works out who they are and checks
 * they are in a match with the reporter, so the body cannot name anyone else.
 */
export class CreateReportDto {
  @IsNumberString({ no_symbols: true })
  targetId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
