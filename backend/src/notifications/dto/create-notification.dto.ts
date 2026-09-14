import { IsString, IsNotEmpty, IsIn } from 'class-validator';

const NOTIFICATION_TYPES = ['match', 'event', 'message', 'profile'] as const;

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @IsIn(NOTIFICATION_TYPES)
  type: 'match' | 'event' | 'message' | 'profile';

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  actionLabel: string;

  @IsString()
  @IsNotEmpty()
  href: string;
}