import type { Prisma } from '../../generated/prisma/client';
import { notHiddenWhere } from '../admin/open-reports';

/**
 * Which coordinators a viewer may see: never one whose account an
 * administrator has deactivated, as with guest lecturers, nor one who is on
 * hold after reports, nor one the viewer has an open report with (whoever made
 * it).
 *
 * Shared by the discovery list and by the profile photo route, so a photo is
 * served to exactly the people the profile is listed to. `keepReportedPair`
 * keeps the people the viewer has an open report with, for the viewer's own
 * matches.
 */
export async function visibleCoordinatorsWhere(
  viewerAuth0Id?: string,
  options: { keepReportedPair?: boolean } = {},
): Promise<Prisma.coordinatorsWhereInput> {
  return {
    OR: [{ user_id: null }, { users: { is: { deletedat: null } } }],
    AND: [await notHiddenWhere(viewerAuth0Id, options)],
  };
}
