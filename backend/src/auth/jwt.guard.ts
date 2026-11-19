import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';
import { ErrorCode } from '../common/error-codes';
import { prisma } from '../prisma';
import { IS_PUBLIC_KEY } from './public.decorator';
import { attachDemoUser, demoBypassEnabled } from './demo-user';
import { recordSignIn } from './record-sign-in';

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

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      const request = context
        .switchToHttp()
        .getRequest<{ user?: { id: string } }>();
      attachDemoUser(request as never);
      void recordSignIn(request.user?.id, { audit: false });
      return true;
    }

    const result = super.canActivate(context);
    const allowed = isObservable(result)
      ? await firstValueFrom(result)
      : await result;
    if (!allowed) {
      return false;
    }

    // DELETE /settings keeps a users row with deletedat set. A token issued
    // before the deletion is still validly signed until it expires, so without
    // this check it could keep calling the API and recreate data.
    const user = context
      .switchToHttp()
      .getRequest<{ user: { id: string } }>().user;
    const deleted = await prisma.users.findFirst({
      where: { auth0Id: user.id, deletedat: { not: null } },
      select: { userid: true },
    });
    if (deleted) {
      throw new UnauthorizedException({
        code: ErrorCode.AuthInvalidToken,
        message: 'This account has been deleted.',
      });
    }

    void recordSignIn(user.id, { audit: true });
    return true;
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
