import { IsNumberString } from 'class-validator';

/**
 * The profile to hide from the caller's Discovery list: a guest id when a
 * coordinator dismisses, a coordinator id when a guest dismisses. The caller's
 * own side comes from their token, never from the body.
 *
 * A digit string for the same reason as the match request ids: a BigInt does
 * not survive JSON, so `toId` converts it at the point of the write.
 */
export class CreateDismissalDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'targetId must be a numeric id' },
  )
  targetId: string;
}
