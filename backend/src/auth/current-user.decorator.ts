import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user';

/**
 * Injects the verified caller into a handler:
 *
 *   getProfile(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * Only ever populated by JwtAuthGuard, so a handler reading this is reading
 * claims from a token whose signature has been checked. Handlers must take the
 * user id from here and never from a route parameter or request body, or
 * ownership checks become forgeable.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
