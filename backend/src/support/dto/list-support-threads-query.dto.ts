import { IsIn, IsNumberString, IsOptional } from 'class-validator';
import { SUPPORT_STATUSES, type SupportStatus } from './set-support-status.dto';

/**
 * Narrows the administrator's list of requests. Both are optional and
 * combine: `userId` limits it to one person's requests, `status` to open or
 * closed ones.
 */
export class ListSupportThreadsQueryDto {
  @IsOptional()
  @IsNumberString(
    { no_symbols: true },
    { message: 'userId must be a numeric id' },
  )
  userId?: string;

  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;
}
