import { Controller, Post, Get, Body, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ErrorCode } from '../common/error-codes';

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
   * The caller's own row, or a 404 the frontend uses to tell a first login
   * from a returning one.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const existing = await this.usersService.findByAuth0Id(user.id);
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.UserProfileNotFound,
        message: 'No profile exists for this account yet.',
      });
    }
    return existing;
  }
}
