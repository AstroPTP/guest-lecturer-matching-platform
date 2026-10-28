/** The id the API gives each request: a ULID, 26 characters of Crockford base32. */
const ULID_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/** The id the proxy gives a request when the API cannot be reached. */
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The correlation id the search text amounts to, or undefined when it is
 * ordinary search text. Only text shaped like a whole id counts, so a name or
 * an action typed into the box still searches the loaded entries. A ULID is
 * returned in capitals, the way the API stores it.
 */
export function correlationIdFromSearch(text: string): string | undefined {
  const trimmed = text.trim();
  if (ULID_ID.test(trimmed)) return trimmed.toUpperCase();
  return UUID_ID.test(trimmed) ? trimmed.toLowerCase() : undefined;
}
