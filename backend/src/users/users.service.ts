import { Injectable } from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import type { AuthenticatedUser } from '../auth/authenticated-user';

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

  /**
   * The caller's row, created on first sight.
   *
   * Registration only creates the Auth0 account, so a signed-in user may have
   * no row yet (and a reset database drops existing ones). A signed-in caller
   * always has an account, so their row is created here rather than reported
   * missing. An upsert, so the parallel requests a page makes on load cannot
   * race each other into a duplicate. A deleted account cannot be revived
   * here: JwtAuthGuard refuses its tokens before this runs.
   */
  async ensureForUser(user: AuthenticatedUser) {
    return prisma.users.upsert({
      where: { auth0Id: user.id },
      update: { lastloginat: new Date() },
      create: {
        auth0Id: user.id,
        email: user.email,
        role: user.roles[0],
        createdat: new Date(),
        lastloginat: new Date(),
      },
    });
  }
}
