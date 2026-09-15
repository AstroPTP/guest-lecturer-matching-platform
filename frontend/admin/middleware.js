import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

export async function middleware(request) {
  const authResponse = await auth0.middleware(request);

  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith('/dashboard');

  if (isProtectedRoute) {
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