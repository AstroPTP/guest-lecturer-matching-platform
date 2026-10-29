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
 * The line logged when the API cannot be reached: one line of JSON, carrying
 * the id the user is shown on the 502, so an id quoted from that screen finds
 * this line.
 *
 * The path is the API path without its query string, which can hold search
 * text. The error contributes only its message.
 */
export function unreachableBackendLogLine(details: {
  correlationId: string;
  method: string;
  path: string;
  error: unknown;
  now?: Date;
}): string {
  return JSON.stringify({
    ts: (details.now ?? new Date()).toISOString(),
    event: 'backend_unreachable',
    correlationId: details.correlationId,
    method: details.method,
    path: details.path,
    error:
      details.error instanceof Error
        ? details.error.message
        : String(details.error),
  });
}
