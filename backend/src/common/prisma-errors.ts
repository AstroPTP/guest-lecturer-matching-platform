/**
 * Whether a Prisma error is a unique constraint violation (P2002).
 *
 * Two identical requests arriving together can both find no row and both try
 * to create it; the second then trips the unique constraint. Callers use this
 * to read the row the first one wrote instead of answering 500.
 *
 * Checks the code rather than the error class so this file does not import the
 * generated client, which the unit tests replace.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
