import { IsString, IsNotEmpty } from 'class-validator';

export class BasicInformationDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  bio: string;

  @IsString()
  photoPreview: string;

  @IsString()
  @IsNotEmpty()
  professionalField: string;

  @IsString()
  @IsNotEmpty()
  professionalRole: string;
}
