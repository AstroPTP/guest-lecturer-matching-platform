import type { Prisma } from '../../generated/prisma/client';

/**
 * Which coordinators other people may see: never one whose account an
 * administrator has deactivated, as with guest lecturers.
 *
 * Shared by the discovery list and by the profile photo route, so a photo is
 * served to exactly the people the profile is listed to.
 */
export const visibleCoordinatorsWhere: Prisma.coordinatorsWhereInput = {
  OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
};
