import { NextResponse } from 'next/server';
import { readSessionClaims } from '@/lib/auth/session';

/**
 * The signed-in user, for the browser.
 *
 * Returns claims only: subject, email, name and roles. **Never the access
 * token.** The token stays in the session the Auth0 SDK manages and is
 * attached to backend calls server-side by /api/backend, so nothing running in
 * the page can read it.
 */
export async function GET() {
  const claims = await readSessionClaims();

  if (!claims) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: claims.sub,
      email: claims.email ?? '',
      name: claims.name ?? '',
      roles: claims.roles,
    },
  });
}
