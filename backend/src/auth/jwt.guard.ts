import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';
import { recordAudit } from '../admin/platform-rules';
import { ErrorCode } from '../common/error-codes';
import { prisma } from '../prisma';
import { IS_PUBLIC_KEY } from './public.decorator';
import { attachDemoUser, demoBypassEnabled } from './demo-user';

const signInLogger = new Logger('SignInAudit');

/**
 * Records that a user has been active, for the administrator's "signed in"
 * figure, and leaves one audit entry each time that figure moves.
 *
 * One conditional UPDATE that only writes when the stored time is missing or
 * over an hour old, so a busy session costs one write an hour rather than one
 * per request. The audit entry rides on the same condition: it is written only
 * when that UPDATE really changed a row, so the trail holds one `user.signed_in`
 * per user per hour of activity and not one per request (NFR-59).
 *
 * What this cannot see is a failed sign-in. A wrong password, an unknown
 * account or a blocked user is refused by Auth0 before any token exists, so
 * the request never reaches this API. Those attempts are in the Auth0 tenant
 * log, not here.
 *
 * Fire-and-forget: a failure here must never block a request, so the returned
 * promise never rejects. It is returned only so a test can wait for it.
 *
 * @param audit false on the demo bypass, whose simulated user is not a person
 *   who signed in and must not appear in the trail as one.
 */
export function recordSignIn(
  auth0Id: string | undefined,
  { audit }: { audit: boolean },
): Promise<void> {
  if (!auth0Id) return Promise.resolve();
  const hourAgo = new Date(Date.now() - 3_600_000);
  // Started inside .then() so that even a synchronous throw from the client
  // lands in .catch() instead of failing the request.
  return Promise.resolve()
    .then(() =>
      prisma.users.updateMany({
        where: {
          auth0Id,
          deletedat: null,
          OR: [{ lastloginat: null }, { lastloginat: { lt: hourAgo } }],
        },
        data: { lastloginat: new Date() },
      }),
    )
    .then(async ({ count }) => {
      if (!audit || count !== 1) return;
      await auditSignIn(auth0Id);
    })
    .catch(() => undefined);
}

/**
 * The audit entry for a sign-in: the user is both the actor and the target.
 * Its failure is logged and not rethrown, so a fault in the audit table can
 * never stand between a user and the application.
 */
async function auditSignIn(auth0Id: string): Promise<void> {
  try {
    const user = await prisma.users.findFirst({
      where: { auth0Id },
      select: { userid: true },
    });
    // Deleted between the UPDATE and here; there is nobody to record.
    if (!user) return;

    await recordAudit(auth0Id, 'user.signed_in', {
      type: 'user',
      id: user.userid.toString(),
    });
  } catch (error) {
    // The error's own text is left out: a database error can quote the
    // statement and its values, and the Auth0 id is one of them.
    signInLogger.warn(
      `Sign-in audit entry not written (${error instanceof Error ? error.name : 'unknown error'})`,
    );
  }
}

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
