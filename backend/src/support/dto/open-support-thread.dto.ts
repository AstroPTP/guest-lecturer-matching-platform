import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * An administrator asking one user for more details. `userId` is the numeric
 * user id the admin portal already works with.
 */
export class OpenSupportThreadDto {
  @IsNumberString(
    { no_symbols: true },
    { message: 'userId must be a numeric id' },
  )
  userId!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  subject!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
