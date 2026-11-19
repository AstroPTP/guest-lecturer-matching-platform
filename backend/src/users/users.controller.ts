import { Controller, Post, Get, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Writes a user row for any Auth0 id, so only an administrator may. */
  @Post()
  @Roles(AppRole.CcaeAdmin)
  create(@Body() createUserProfileDto: CreateUserProfileDto) {
    return this.usersService.create(createUserProfileDto);
  }

  /** Every account with its email, so only an administrator may list them. */
  @Get()
  @Roles(AppRole.CcaeAdmin)
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * The caller's own row, created if this is their first visit.
   * `profileCompleted` says whether they have finished the setup wizard (the
   * consent step sets `consentstate`), so the frontend can send them to the
   * dashboard instead of back through it.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const existing = await this.usersService.ensureForUser(user);
    return { ...existing, profileCompleted: existing.consentstate === true };
  }
}
