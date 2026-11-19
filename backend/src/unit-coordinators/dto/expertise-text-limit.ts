import { MaxLength } from 'class-validator';

/**
 * The longest free text a coordinator can save for the two descriptions. The
 * profile form stops at 350 characters, so this is only a server-side ceiling:
 * it keeps one profile from carrying a very large value that is later read
 * into session titles and descriptions. A value already stored above it gets a
 * 400 on re-save until it is shortened (the forms stop at 350).
 */
export const MAX_EXPERTISE_TEXT_LENGTH = 2000;

/** Caps a description at MAX_EXPERTISE_TEXT_LENGTH characters. */
export const MaxExpertiseText = () => MaxLength(MAX_EXPERTISE_TEXT_LENGTH);
