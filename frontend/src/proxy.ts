import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/config';

/**
 * Next.js proxy (called middleware before Next 16).
 *
 * Turns an unauthenticated request for a dashboard route into a redirect to
 * /login. Those routes are otherwise reachable by anyone who types the URL.
 *
 * Prefix matching rather than per-page, so a page added under one of these
 * roots is protected without its author having to remember (EOP-09).
 *
 * This checks only that a session cookie is present. It is a routing
 * convenience, not a security boundary — the cookie's contents are not
 * verified here. Every actual decision is made by the NestJS guards, which
 * verify the token's RS256 signature on every request. A forged cookie gets
 * you a rendered page whose every API call returns 401.
 */
const PROTECTED_PREFIXES = ['/guest_lecturer', '/unit_coordinator'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  // Ships off so that pulling this branch does not lock the team out of the
  // client demo before test accounts exist. Turn on in .env.local.
  if (process.env.NEXT_PUBLIC_AUTH_ENFORCED !== 'true') {
    return NextResponse.next();
  }

  if (!isProtected(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  // So the user lands where they were aiming once they sign in. LoginForm
  // only honours same-origin paths — see safeRedirect there.
  loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and images — those carry no session and
     * running on them would cost a check per asset per page load.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
