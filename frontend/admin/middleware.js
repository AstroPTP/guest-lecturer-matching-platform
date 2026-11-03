import { NextResponse } from 'next/server';
import { auth0, auth0Configured } from './lib/auth0';

/** The namespaced claim the identity provider puts roles in. */
const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';
const ADMIN_ROLE = 'ccae_admin';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Without a configured tenant there is no session to mount and none to
  // check. The portal then renders signed-out rather than answering every
  // route with a server error.
  if (!auth0Configured()) {
    return NextResponse.next();
  }

  const authResponse = await auth0.middleware(request);

  if (!pathname.startsWith('/dashboard')) {
    return authResponse;
  }

  const session = await auth0.getSession(request);

  if (!session) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Being signed in is not the same as being an administrator. Any account on
  // the platform could previously reach this portal by typing the address:
  // the API refused the calls, so the pages rendered as a wall of failures
  // rather than as a refusal, which reads as a broken portal instead of one
  // the visitor has no business being in.
  //
  // This is a redirect, not a security control. The API verifies the token and
  // checks the role on every request regardless of what happens here.
  const claims = session.user ?? {};
  const roles = Array.isArray(claims[ROLES_CLAIM]) ? claims[ROLES_CLAIM] : [];

  if (!roles.includes(ADMIN_ROLE)) {
    const deniedUrl = new URL('/', request.url);
    deniedUrl.searchParams.set('denied', 'administrator-only');
    return NextResponse.redirect(deniedUrl);
  }

  return authResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
