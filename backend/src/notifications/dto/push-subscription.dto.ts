import { Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_ENDPOINT_LENGTH } from '../push';

/**
 * The two keys a browser makes for a push subscription, as URL-safe base64:
 * the device's public key (65 bytes, so 87 characters) and the shared secret
 * (16 bytes, so 22).
 */
export class PushKeysDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{87}$/, { message: 'p256dh is not a valid key' })
  p256dh: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/, { message: 'auth is not a valid secret' })
  auth: string;
}

/**
 * What a browser reports when it subscribes. The address is checked against the
 * known push services in the route, not here, so that the reason is stated in
 * one place.
 */
export class SubscribePushDto {
  @IsString()
  @MaxLength(MAX_ENDPOINT_LENGTH)
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

/** Names the device to remove. */
export class UnsubscribePushDto {
  @IsString()
  @MaxLength(MAX_ENDPOINT_LENGTH)
  endpoint: string;
}
