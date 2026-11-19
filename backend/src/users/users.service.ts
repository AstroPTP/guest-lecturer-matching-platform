import { Injectable } from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { demoBypassEnabled } from '../auth/demo-user';
import { recordSignIn } from '../auth/record-sign-in';

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
   *
   * The guard runs first and finds no row to update for a new account, so the
   * row this call creates is handed to the same `recordSignIn` the guard uses.
   * That one conditional write sets `lastloginat` and leaves the
   * `user.signed_in` audit entry, and it only writes while the stored time is
   * missing or over an hour old, so it cannot double up with a write the guard
   * makes for a request that arrives a moment later. The row is created with
   * no `lastloginat` so that write can happen.
   */
  async ensureForUser(user: AuthenticatedUser) {
    const createdAt = new Date();
    const row = await prisma.users.upsert({
      where: { auth0Id: user.id },
      update: {},
      create: {
        auth0Id: user.id,
        email: user.email,
        role: user.roles[0],
        createdat: createdAt,
      },
    });

    // The creation time is the one passed in only when this call made the row.
    // Were another call to create it in the same millisecond, both would reach
    // recordSignIn, whose conditional write lets only one of them record it.
    if (row.createdat?.getTime() === createdAt.getTime()) {
      // The demo bypass signs in a simulated user, who is not a person and is
      // kept out of the audit trail as the guard keeps it out.
      await recordSignIn(user.id, { audit: !demoBypassEnabled() });
    }

    return row;
  }
}
