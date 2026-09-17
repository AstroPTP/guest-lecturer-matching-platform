import { Injectable } from '@nestjs/common';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';

import { prisma } from '../prisma';

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

  private async createUnitInDatabase(dto: CcaeAdministrator) {
    await prisma.admins.create({
      data: {
        admin_level: dto.adminLevel,
        last_login: dto.lastLogin,
      },
    });
  }
}
