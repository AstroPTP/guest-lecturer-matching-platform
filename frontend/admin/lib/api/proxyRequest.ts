/**
 * Pure helpers for the backend-for-frontend proxy route. They live here
 * because a Next route file may export only its HTTP handlers.
 */

/** Request headers the proxy never copies from the browser to the API. */
const NOT_FORWARDED = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  // Never forward a client-supplied Authorization header. The token comes from
  // the cookie; accepting one from the caller would let the browser choose its
  // own credentials and defeat the whole arrangement.
  'authorization',
  'cookie',
  // The backend gives every request its own id, and that id is what the logs,
  // the audit trail and the error a user sees have in common. One chosen by
  // the browser would let a caller pick the id its actions are filed under.
  'x-correlation-id',
  // Conditional requests would let the API answer 304 with no body, which is
  // not what a no-store response should be built from.
  'if-none-match',
  'if-modified-since',
  'if-match',
  'if-unmodified-since',
  'if-range',
]);

/** The browser's headers, less the ones the proxy sets or refuses to pass on. */
export function forwardedHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    if (!NOT_FORWARDED.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}
