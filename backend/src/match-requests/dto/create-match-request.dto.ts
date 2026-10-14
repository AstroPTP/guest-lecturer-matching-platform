import { IsNumberString } from 'class-validator';

/**
 * The profile to send a request to: a guest id when a coordinator asks, a
 * coordinator id when a guest asks. The caller's own side comes from their
 * token, never from the body; taking both ids from the body let a caller write
 * a request on anyone's behalf.
 *
 * A digit string because the ids are `BigInt` columns and a BigInt does not
 * survive JSON, so `toId` converts it at the point of the write.
 */
export class CreateMatchRequestDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'targetId must be a numeric id' },
  )
  targetId: string;
}
