import { IsString } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  unitCode: string;

  @IsString()
  unitName: string;
}
