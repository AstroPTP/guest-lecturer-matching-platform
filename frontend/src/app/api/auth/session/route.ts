import { NextResponse } from 'next/server';
import { readSessionClaims } from '@/lib/auth/session';

/**
 * The signed-in user, for the browser.
 *
 * Returns claims only — subject, email, name, roles. **Never the access
 * token.** The token stays in the HttpOnly cookie and is attached to backend
 * calls server-side by /api/backend, so nothing in the browser can read it
 * (TAM-01).
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
