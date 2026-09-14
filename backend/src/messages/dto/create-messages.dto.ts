import { IsUUID, IsString, MaxLength } from 'class-validator';

export class CreateMessagesDto {
  @IsUUID()
  matchId: string;

  @IsString()
  @MaxLength(2000)
  content: string;
}
