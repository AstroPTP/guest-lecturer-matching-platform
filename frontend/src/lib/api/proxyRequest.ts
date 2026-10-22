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

/**
 * The path to append to the API's address, from the segments the browser sent.
 *
 * Each segment is percent-encoded first. Next hands the route its segments
 * already decoded, so a `#` or `?` that arrived as %23 or %3F would otherwise
 * end the path or start a query when the segments are joined into a URL, and
 * the API would be asked for a different route from the one named.
 */
export function upstreamPath(segments: string[]): string {
  return segments.map(encodeURIComponent).join('/');
}
