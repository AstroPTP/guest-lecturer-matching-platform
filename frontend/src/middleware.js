import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

export async function middleware(request) {
  const authResponse = await auth0.middleware(request);

  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname.startsWith('/guest_lecturer') ||
    pathname.startsWith('/unit_coordinator');

  // TEMPORARY: route gate disabled while login isn't wired to a real backend
  // session yet. Re-enable this block once login actually authenticates.
  if (false && isProtectedRoute) {
    const session = await auth0.getSession(request);
    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return authResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};