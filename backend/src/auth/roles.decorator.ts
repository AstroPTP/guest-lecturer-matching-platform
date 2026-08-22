import { SetMetadata } from '@nestjs/common';
import { AppRole } from './roles';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to callers holding at least one of the listed roles.
 *
 *   @Roles(AppRole.CcaeAdmin)
 *   @Post('users/:id/roles')
 *
 * Most-permissive-wins: a caller holding several roles is admitted if any one
 * of them is listed, per the RBAC Matrix enforcement notes.
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
