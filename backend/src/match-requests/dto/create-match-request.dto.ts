import { IsNumberString } from 'class-validator';

/**
 * The ids are digit strings because a match request references rows the
 * database assigned: `match_requests.coordinator_id` and `guest_id` are
 * `BigInt @default(autoincrement())`, not UUIDs. They were validated as UUIDs
 * here, which rejected every real id at the global ValidationPipe before the
 * service could convert it.
 *
 * They stay strings rather than becoming numbers because a BigInt does not
 * survive JSON, so ids travel as strings above the database and `toId` does the
 * conversion at the point of the write.
 */
export class CreateMatchRequestDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'unitId must be a numeric id' },
  )
  unitId: string;

  @IsNumberString(
    { no_symbols: true },
    { message: 'speakerId must be a numeric id' },
  )
  speakerId: string;
}
