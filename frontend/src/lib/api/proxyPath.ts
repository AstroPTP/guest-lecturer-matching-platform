/**
 * Whether one segment of a proxied path could steer the request somewhere
 * other than the API route it names.
 *
 * Refuses a segment that is `.` or `..`, or that holds a slash, a backslash or
 * a NUL. The check is made on the segment as given and again after each round
 * of percent-decoding, so `%2e%2e`, `..%2f` and a doubly encoded `%252e%252e`
 * are caught the same as the plain forms. A segment that is not valid
 * percent-encoding, or that is still decoding after four rounds, is refused
 * rather than guessed at.
 */
export function isUnsafeSegment(segment: string): boolean {
  let current = segment;
  for (let round = 0; round < 4; round += 1) {
    if (current === '.' || current === '..' || /[/\\\0]/.test(current)) {
      return true;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }
    if (decoded === current) {
      return false;
    }
    current = decoded;
  }
  return true;
}

/** True when every segment of the path is safe to pass on to the API. */
export function isSafeProxyPath(segments: string[]): boolean {
  return !segments.some(isUnsafeSegment);
}
