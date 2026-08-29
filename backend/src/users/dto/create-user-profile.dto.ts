import { IsString, IsEmail, IsEnum } from 'class-validator';

export enum UserRole {
  GUEST_SPEAKER = 'GUEST_SPEAKER',
  UNIT_COORDINATOR = 'UNIT_COORDINATOR',
  CCAE_ADMINISTRATOR = 'CCAE_ADMINISTRATOR',
}

export class CreateUserProfileDto {
  @IsString()
  auth0Id: string;

  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;
}