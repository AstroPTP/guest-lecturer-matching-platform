import { Controller, Post, Get, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserProfileDto: CreateUserProfileDto) {
    return this.usersService.create(createUserProfileDto);
  }

  @Get()
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
