import { IsIn, IsOptional } from 'class-validator';
import { DISCOVERY_SORTS, type DiscoverySort } from '../discovery-sort';

/**
 * The optional query on the two Discovery lists. A value that is not one of
 * the listed sorts is refused with a 400 rather than ignored, so a mistyped
 * option never silently gives the default order.
 */
export class DiscoveryQueryDto {
  /**
   * How to order the list. Left out, the order is the best match first while
   * ranked matching is on and the order people joined while it is off.
   */
  @IsOptional()
  @IsIn(DISCOVERY_SORTS, {
    message: `sort must be one of: ${DISCOVERY_SORTS.join(', ')}`,
  })
  sort?: DiscoverySort;
}
