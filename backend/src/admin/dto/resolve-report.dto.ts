import { IsIn } from 'class-validator';

export class ResolveReportDto {
  @IsIn(['dismissed', 'deactivated'])
  outcome!: 'dismissed' | 'deactivated';
}
