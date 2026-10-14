import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * A message to the person behind `targetId`, the other profile in the match.
 * The match itself is looked up from the caller's token, so a caller cannot
 * write into a match they are not part of by naming its id.
 */
export class CreateMessagesDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'targetId must be a numeric id' },
  )
  targetId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
