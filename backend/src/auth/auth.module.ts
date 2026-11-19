import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { APP_ENV } from '../config/app-env.token';
import { validateEnv } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

/**
 * Wires authentication and authorisation in, application-wide.
 *
 * Both guards are registered as APP_GUARD rather than left for each controller
 * to apply. That makes protection the default: a route added next week is
 * closed unless its author writes @Public(), so the failure mode of forgetting
 * is a locked door rather than an open one (checklist EOP-09).
 *
 * Registration order matters and is not incidental. Nest runs APP_GUARD
 * providers in declaration order, so JwtAuthGuard runs first and RolesGuard
 * second. That is what guarantees a signature is verified before any role is
 * read, which is the property TAM-04 and EOP-03 test for. Do not reorder.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [
    { provide: APP_ENV, useFactory: () => validateEnv() },
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
