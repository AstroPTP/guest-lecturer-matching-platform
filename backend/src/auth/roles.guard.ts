import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../common/error-codes';
import { AuthenticatedUser } from './authenticated-user';
import { AppRole } from './roles';
import { ROLES_KEY } from './roles.decorator';

/**
 * Authorisation gate. Runs after JwtAuthGuard, so by the time it sees a
 * request the signature has already been verified — which is the ordering the
 * whole design depends on. A caller who edits the role list inside their own
 * token never reaches this guard; they are rejected at the signature check
 * with 401 (checklist TAM-04, EOP-03).
 *
 * Reads only the token. No database call on the hot path, per the RBAC Matrix
 * enforcement notes and the SRS §6.2 latency budget.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() means authentication alone is enough. Authorisation is
    // opt-in per route; authentication is not.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // Reached only if this guard is applied to a route with no authentication
    // in front of it. Denying is the correct response to a misconfiguration.
    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.AuthzInsufficientRole,
        message: 'You do not have permission to perform this action',
      });
    }

    // Most-permissive-wins: any one matching role admits the caller.
    //
    // An empty user.roles matches nothing and is denied. That is the point of
    // EOP-04 — if the access token hook is disabled or throws, tokens arrive
    // with no roles claim, and every guarded route closes rather than opens.
    const permitted = user.roles.some((held) => required.includes(held));

    if (!permitted) {
      throw new ForbiddenException({
        code: ErrorCode.AuthzInsufficientRole,
        message: 'You do not have permission to perform this action',
      });
    }

    return true;
  }
}
