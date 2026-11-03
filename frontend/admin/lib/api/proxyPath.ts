/**
 * Whether one segment of a proxied path could steer the request somewhere
 * other than the API route it names.
 *
 * The segments reach the proxy already percent-decoded by Next, and are
 * encoded once on the way out, so a segment is judged as it is and never
 * decoded again. A `%` in a segment is an ordinary character: `50%` is sent as
 * `50%25`, and `%2e%2e` is a name made of those characters, sent as
 * `%252e%252e`, not a dot segment.
 *
 * Refuses a segment that is `.` or `..`, or that holds a slash, a backslash or
 * a NUL.
 */
export function isUnsafeSegment(segment: string): boolean {
  return segment === '.' || segment === '..' || /[/\\\0]/.test(segment);
}

/** True when every segment of the path is safe to pass on to the API. */
export function isSafeProxyPath(segments: string[]): boolean {
  return !segments.some(isUnsafeSegment);
}
