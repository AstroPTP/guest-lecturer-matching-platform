import { NextResponse } from 'next/server';
import { readAdminClaims } from '@/lib/auth/session';

/**
 * The signed-in administrator, for the browser.
 *
 * Claims only, never the access token. The portal used to serve the raw token
 * from this directory so that client code could call the API itself; the proxy
 * does that server-side now.
 */
export async function GET() {
  const claims = await readAdminClaims();

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
