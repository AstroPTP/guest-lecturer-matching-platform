import { IsUUID } from 'class-validator';

export class CreateMatchRequestDto {
  @IsUUID()
  unitId: string;

  @IsUUID()
  speakerId: string;
}
