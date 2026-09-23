import { Injectable } from '@nestjs/common';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';

import { prisma } from '../prisma';

export interface CcaeAdministrator extends CreateCcaeAdministratorDto {
  adminId: string;
  lastLogin: Date;
}

@Injectable()
export class CcaeAdministratorsService {
  /**
   * Creates an administrator and returns the stored row.
   *
   * The row comes back from the database rather than from memory, so the id is
   * the one the database assigned.
   */
  async create(createCcaeAdministratorDto: CreateCcaeAdministratorDto) {
    return this.createUnitInDatabase({
      adminId: '',
      lastLogin: new Date(),
      ...createCcaeAdministratorDto,
    });
  }

  async findAll() {
    return prisma.admins.findMany({
      orderBy: { admin_id: 'desc' },
    });
  }

  private async createUnitInDatabase(dto: CcaeAdministrator) {
    return prisma.admins.create({
      data: {
        admin_level: dto.adminLevel,
        last_login: dto.lastLogin,
      },
    });
  }
}
