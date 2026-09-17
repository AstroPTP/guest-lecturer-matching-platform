import { Injectable } from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';

import { prisma } from '../prisma';

@Injectable()
export class UsersService {
  async create(createUserProfileDto: CreateUserProfileDto) {
    return prisma.users.create({
      data: {
        auth0Id: createUserProfileDto.auth0Id,
        email: createUserProfileDto.email,
        role: createUserProfileDto.role,
        createdat: new Date(),
      },
    });
  }

  async findAll() {
    return prisma.users.findMany({ orderBy: { userid: 'asc' } });
  }

  /**
   * The row for a given Auth0 subject, or null if they have none yet.
   *
   * This is the lookup the rest of the app needs at login: given the `sub` a
   * verified token carries, find the internal user it belongs to. Requires
   * `auth0Id` to be unique in the schema, which is what makes `findUnique`
   * valid here rather than a `findFirst` guess.
   */
  async findByAuth0Id(auth0Id: string) {
    return prisma.users.findUnique({ where: { auth0Id } });
  }
}
