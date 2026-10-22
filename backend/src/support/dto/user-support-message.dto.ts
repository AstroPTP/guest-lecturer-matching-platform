import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A user's reply, sent as multipart form data. The text is optional because a
 * reply may be only a file; the service refuses a reply with neither. The file
 * itself is read by the upload interceptor, not validated here.
 */
export class UserSupportMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
