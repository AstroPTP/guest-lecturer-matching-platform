import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '../common/error-codes';
import { IS_PUBLIC_KEY } from './public.decorator';
import { attachDemoUser, demoBypassEnabled } from './demo-user';

/**
 * Authentication gate. Registered globally in AuthModule, so every route is
 * protected unless it carries @Public().
 *
 * Its whole job is to run the JwtStrategy and translate the outcome into the
 * two error codes the frontend branches on.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Method-level @Public() beats class-level, which is what getAllAndOverride
    // gives us.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Temporary, for testing the application before the login flow is wired.
    // Attaches a simulated user instead of skipping the guards, so RolesGuard
    // still runs and still refuses a route the simulated role cannot reach.
    // Refuses to engage in production regardless of the flag. See demo-user.ts.
    if (demoBypassEnabled()) {
      attachDemoUser(context.switchToHttp().getRequest());
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Distinguishes "you sent no credentials" from "you sent bad credentials".
   *
   * Both are 401. The difference is only in the code, so the frontend can
   * send an unauthenticated visitor to log in rather than showing them a
   * "session expired" error. Neither branch reveals why a token failed; a
   * caller learning whether it was the signature, the audience or the expiry
   * that rejected them learns something about our configuration.
   */
  handleRequest<TUser>(error: unknown, user: TUser, info: unknown): TUser {
    if (user) {
      return user;
    }

    if (error instanceof Error) {
      throw error;
    }

    // passport-jwt reports a missing or unparseable header via `info`.
    const reason = info instanceof Error ? info.message : '';
    const credentialsAbsent =
      reason === 'No auth token' ||
      reason.includes('does not match') ||
      reason.includes('Format is Authorization: Bearer');

    throw new UnauthorizedException({
      code: credentialsAbsent
        ? ErrorCode.AuthMissingBearer
        : ErrorCode.AuthInvalidToken,
      message: credentialsAbsent
        ? 'Authentication required'
        : 'The access token is not valid',
    });
  }
}
