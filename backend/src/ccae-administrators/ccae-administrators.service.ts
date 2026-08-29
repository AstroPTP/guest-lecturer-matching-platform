import { Injectable } from '@nestjs/common';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';

export interface CcaeAdministrator extends CreateCcaeAdministratorDto {
  adminId: string;
  lastLogin: Date;
}

@Injectable()
export class CcaeAdministratorsService {
  private administrators: CcaeAdministrator[] = [];

  create(createCcaeAdministratorDto: CreateCcaeAdministratorDto) {
    const newAdministrator: CcaeAdministrator = {
      adminId: crypto.randomUUID(),
      lastLogin: new Date(),
      ...createCcaeAdministratorDto,
    };
    this.administrators.push(newAdministrator);
    return newAdministrator;
  }

  findAll() {
    return this.administrators;
  }
}