import { IsIn } from 'class-validator';

export class SetUserStatusDto {
  @IsIn(['active', 'deactivated'])
  status!: 'active' | 'deactivated';
}
