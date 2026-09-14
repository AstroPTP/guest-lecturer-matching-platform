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
  schoolDepartment: string;

  @IsString()
  @IsNotEmpty()
  academicRole: string;
}