import { IsIn, IsOptional, IsString } from 'class-validator';
import { DISCOVERY_SORTS, type DiscoverySort } from '../discovery-sort';

/**
 * The optional query on the two Discovery lists. A value that is not one of
 * the listed sorts is refused with a 400 rather than ignored, so a mistyped
 * option never silently gives the default order.
 *
 * `forMatches` is read by the same route, so it is listed here: the request
 * validation refuses any query key that is not.
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

  /**
   * `true` lists the caller's matched profiles instead of Discovery's, keeping
   * someone the caller has an open report with so their conversation stays
   * where it was. Any other value gives Discovery's list.
   */
  @IsOptional()
  @IsString()
  forMatches?: string;
}
