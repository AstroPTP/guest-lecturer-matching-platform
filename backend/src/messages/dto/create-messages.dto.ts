import { IsNumberString, IsString, MaxLength } from 'class-validator';

/**
 * `matchId` is a digit string for the same reason as in the match request DTO:
 * `messages.match_id` is a `BigInt` pointing at a row the database assigned, so
 * validating it as a UUID rejected every id that could actually exist.
 */
export class CreateMessagesDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'matchId must be a numeric id' },
  )
  matchId: string;

  @IsString()
  @MaxLength(2000)
  content: string;
}
