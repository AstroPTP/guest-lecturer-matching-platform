/**
 * A per-process, fixed-window attempt counter for the public auth routes.
 *
 * In memory, so it resets on restart and is not shared between instances. It
 * is a first brake on password guessing and email probing from one address;
 * Auth0's own brute-force protection sits behind it.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Counts an attempt against `key` and says whether it went over `max`. */
export function tooManyAttempts(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

/** The caller's address as the nearest proxy reported it, or "" locally. */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}
