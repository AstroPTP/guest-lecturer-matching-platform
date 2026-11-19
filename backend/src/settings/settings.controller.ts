import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { SettingsService } from './settings.service';

export class EmailChangeDto {
  @IsEmail() @MaxLength(254) newEmail: string;
  @IsString() @MinLength(1) @MaxLength(1024) currentPassword: string;
}

export class PasswordChangeDto {
  @IsString() @MinLength(1) @MaxLength(1024) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(1024) newPassword: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(8) @MaxLength(1024) newPassword: string;
}

export class AccountStatusDto {
  @IsEmail() @MaxLength(254) email: string;
}

export class RegisterDto {
  @IsIn(['guest', 'coordinator']) role: 'guest' | 'coordinator';
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsString() @MinLength(8) @MaxLength(1024) password: string;
}

/**
 * Account management backed by the Auth0 Management API.
 *
 * Every route except account-status needs a verified token, and the user id
 * always comes from @CurrentUser(), never from the body, so a caller can only
 * act on their own account.
 *
 * The tight 5/min throttle is on the class so a new route inherits it; the two
 * routes the login flow calls on every sign-in override it upward.
 */
@Controller('settings')
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.getAccount(user.id);
  }

  @Patch('email')
  changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailChangeDto,
  ) {
    return this.settings.changeEmail(
      user.id,
      dto.newEmail.trim(),
      dto.currentPassword,
    );
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasswordChangeDto,
  ) {
    return this.settings.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /** Called after the forgot-password OTP has signed the caller in. */
  @Patch('reset-password')
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.settings.resetPassword(user.id, dto.newPassword);
  }

  /**
   * Public: the login form asks this before it has a token. It answers only
   * whether a password account with a role exists, nothing about the account.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('account-status')
  accountStatus(@Body() dto: AccountStatusDto) {
    return this.settings.isRegistered(dto.email);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('sync-roles')
  syncRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.syncRoles(user.id);
  }

  /** Called after the registration OTP has signed the caller in. */
  @Post('register')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDto) {
    return this.settings.completeRegistration(
      user.id,
      dto.role,
      dto.name.trim(),
      dto.password,
    );
  }

  @Delete()
  deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.deleteAccount(user.id);
  }
}
