/**
 * Where the proxy forwards to.
 *
 * Deliberately not NEXT_PUBLIC_: the browser never calls the API directly, so
 * this value has no business being compiled into the bundle. Throws rather
 * than defaulting, because a silently wrong backend address produces a page
 * full of empty states that looks like a database problem.
 */
export function backendUrl(): string {
  const url = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error(
      'BACKEND_URL is not set. Copy frontend/admin/.env.local.template to frontend/admin/.env.local and fill in the values.',
    );
  }

  return url.replace(/\/+$/, '');
}
