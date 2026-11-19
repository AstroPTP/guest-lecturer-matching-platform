import { IsIn } from 'class-validator';

export const SUPPORT_STATUSES = ['open', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export class SetSupportStatusDto {
  @IsIn(SUPPORT_STATUSES)
  status!: SupportStatus;
}
