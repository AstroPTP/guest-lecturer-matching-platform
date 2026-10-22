import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { readMatchingSettings } from './matching-settings';

/** The code and words an administrator's switch gives the 404, which the page shows. */
export const SUGGESTIONS_DISABLED_CODE = 'SUGGESTIONS_DISABLED';
export const SUGGESTIONS_DISABLED_MESSAGE =
  'Suggested speakers is turned off by an administrator.';

/**
 * Whether Suggested speakers is switched on.
 *
 * On unless MATCHING_SUGGESTIONS_ENABLED is set to "false". An unset, empty
 * or misspelled value leaves it on, so a typo can never switch a feature off
 * by accident. Read when a request arrives, not at boot, because it is
 * optional and has a default; there is nothing to fail fast about.
 */
export function suggestionsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.MATCHING_SUGGESTIONS_ENABLED?.trim().toLowerCase() !== 'false';
}

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
