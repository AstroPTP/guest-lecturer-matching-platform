import { IsString } from 'class-validator';

export class CreateCcaeAdministratorDto {
  @IsString()
  adminLevel: string;
}
