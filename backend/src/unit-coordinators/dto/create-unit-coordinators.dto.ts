import { IsString } from 'class-validator';

export class CreateUnitCoordinatorsDto {
  @IsString()
  department: string;

  @IsString()
  faculty: string;
}