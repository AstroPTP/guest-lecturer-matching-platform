import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

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
 * Runs after the application-wide guards, so a caller with no token still gets
 * 401 and one with the wrong role still gets 403, and only a permitted caller
 * is told the route is not there. It runs before validation, so a malformed
 * query on a disabled route is 404 and not 400.
 */
@Injectable()
export class SuggestionsEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!suggestionsEnabled()) {
      throw new NotFoundException();
    }
    return true;
  }
}
