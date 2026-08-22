import { NextResponse } from 'next/server';
import { authAudience, authOrigin, devLoginEnabled, SESSION_COOKIE } from '@/lib/auth/config';
import { decodeClaims, sessionCookieOptions } from '@/lib/auth/session';

/**
 * Exchanges a test account email for an access token from the dev IdP and
 * stores it in an HttpOnly cookie.
 *
 * This is an authentication bypass — it issues a signed token for an email
 * with no password. It exists so the auth flow can be demonstrated and tested
 * before the Auth0 tenant is configured, and it is gated twice: the route
 * returns 404 unless NEXT_PUBLIC_DEV_LOGIN is explicitly "true", and never
 * responds at all when NODE_ENV is production.
 *
 * The production replacement is Auth0's hosted login (Authorization Code +
 * PKCE) per SAS §2.5.1. See frontend/src/lib/auth/README.md.
 */
export async function POST(request: Request) {
  if (!devLoginEnabled()) {
    // 404 rather than 403 — a disabled route should not advertise that it
    // exists.
    return new NextResponse(null, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email : '';

  if (!email) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: 'An email is required.' },
      { status: 400 },
    );
  }

  const response = await fetch(`${authOrigin()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      audience: authAudience(),
      grant_type: 'password',
    }),
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      {
        code: 'IDP_UNREACHABLE',
        message:
          'The identity provider is not responding. Is the dev IdP running? ' +
          '`node tools/dev-idp/server.js`',
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { code: 'AUTH_INVALID_CREDENTIALS', message: 'That account is not recognised.' },
      { status: 401 },
    );
  }

  const token = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!token.access_token || !decodeClaims(token.access_token)) {
    return NextResponse.json(
      { code: 'AUTH_INVALID_TOKEN', message: 'The identity provider returned an unusable token.' },
      { status: 502 },
    );
  }

  const result = NextResponse.json({ ok: true });
  result.cookies.set(
    SESSION_COOKIE,
    token.access_token,
    sessionCookieOptions(token.expires_in ?? 3600),
  );
  return result;
}
