import {
  IsArray,
  IsString,
  IsOptional,
  IsPhoneNumber,
  IsEmail,
} from 'class-validator';

export class CreateGuestSpeakerDto {
  @IsArray()
  @IsString({ each: true })
  expertiseAreas: string[];

  @IsArray()
  @IsString({ each: true })
  presentationTopics: string[];

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsPhoneNumber('AU')
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  directEmail?: string;
}