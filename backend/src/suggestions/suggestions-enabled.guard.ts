import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { readMatchingSettings, suggestionsEnabled } from './matching-settings';

// Kept importable from here, where it was first written.
export { suggestionsEnabled };

/** The code and words an administrator's switch gives the 404, which the page shows. */
export const SUGGESTIONS_DISABLED_CODE = 'SUGGESTIONS_DISABLED';
export const SUGGESTIONS_DISABLED_MESSAGE =
  'Suggested speakers is turned off by an administrator.';

/**
 * Answers 404 when the feature is off, as though the route did not exist.
 *
 * Two switches, and either one turns it off. MATCHING_SUGGESTIONS_ENABLED=false
 * is a hard off that wins over everything, and gives a bare 404 without even
 * reading the database. Otherwise an administrator's switch in Settings applies,
 * and says so in the 404, so the page can tell the coordinator why.
 *
 * Runs after the application-wide guards, so a caller with no token still gets
 * 401 and one with the wrong role still gets 403, and only a permitted caller
 * is told the route is not there. It runs before validation, so a malformed
 * query on a disabled route is 404 and not 400.
 */
@Injectable()
export class SuggestionsEnabledGuard implements CanActivate {
  async canActivate(): Promise<boolean> {
    if (!suggestionsEnabled()) {
      throw new NotFoundException();
    }
    const { enabled } = await readMatchingSettings();
    if (!enabled) {
      throw new NotFoundException({
        code: SUGGESTIONS_DISABLED_CODE,
        message: SUGGESTIONS_DISABLED_MESSAGE,
      });
    }
    return true;
  }
}
