/**
 * Switches for features that can be turned off without a code change.
 *
 * Next.js writes NEXT_PUBLIC_ values into the build, so changing one needs a
 * restart of `npm run dev` or a rebuild. Always read the variable by its full
 * name: Next.js only replaces `process.env.NEXT_PUBLIC_NAME` written out in
 * full, not a lookup through a variable or a destructured `process.env`.
 */

/**
 * Suggested speakers: the menu item, the page and its section of the Help
 * guide. On unless the variable is exactly "false", so a missing or misspelled
 * value leaves it on. The API has its own switch, MATCHING_SUGGESTIONS_ENABLED;
 * set both the same way.
 */
export const MATCHING_SUGGESTIONS_ENABLED =
  process.env.NEXT_PUBLIC_MATCHING_SUGGESTIONS?.trim().toLowerCase() !== "false";
