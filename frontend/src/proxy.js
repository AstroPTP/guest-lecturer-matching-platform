import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';

/**
 * Route gate for the two dashboards. Next 16 renamed the middleware file
 * convention to "proxy"; it runs before every matched request, on Node.js.
 */

const ROLES_CLAIM = 'https://glmp.curtin.edu.au/roles';

/**
 * Carries the cookies the SDK set on authResponse onto a response we built
 * ourselves. The SDK writes the rolled session, and a freshly rotated refresh
 * token, there. Returning a redirect without them throws the new refresh token
 * away; the browser then presents the old one, Auth0 sees it reused and
 * revokes the whole chain, and the user is signed out.
 */
function withAuthCookies(response, authResponse) {
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

function redirectToLogin(request, authResponse) {
  // Our own login page, which reads redirectTo and returns here after a
  // password or social sign-in.
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname + request.nextUrl.search);
  return withAuthCookies(NextResponse.redirect(loginUrl), authResponse);
}

export async function proxy(request) {
  // Serves /auth/login, /auth/callback and /auth/logout, and rolls the session
  // cookie on every other request.
  const authResponse = await auth0.middleware(request);

  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname.startsWith('/guest_lecturer') ||
    pathname.startsWith('/unit_coordinator');

  if (!isProtectedRoute) {
    return authResponse;
  }

  const session = await auth0.getSession(request);
  if (!session) {
    return redirectToLogin(request, authResponse);
  }

  // Refresh the access token here, where the rotated refresh token can be
  // written back through authResponse. Route handlers can write cookies too,
  // but doing it on navigation means the page's API calls start with a fresh
  // token instead of several of them racing to refresh the same one. If it
  // cannot be refreshed the session is of no use to the backend, so sign in
  // again rather than render a page whose data will not load.
  try {
    await auth0.getAccessToken(request, authResponse);
  } catch {
    return redirectToLogin(request, authResponse);
  }

  const roles = session.user?.[ROLES_CLAIM];
  const isCoordinatorRoute = pathname.startsWith('/unit_coordinator');
  const requiredRole = isCoordinatorRoute ? 'unit_coordinator' : 'guest_speaker';
  const otherRole = isCoordinatorRoute ? 'guest_speaker' : 'unit_coordinator';

  if (!Array.isArray(roles) || !roles.includes(requiredRole)) {
    // Signed in, but holding the other dashboard's role: send them to the
    // same page on the dashboard they can use. The two dashboards have the
    // same page set, and the target requires a role they hold, so this
    // cannot loop.
    if (Array.isArray(roles) && roles.includes(otherRole)) {
      const target = isCoordinatorRoute
        ? pathname.replace(/^\/unit_coordinator/, '/guest_lecturer')
        : pathname.replace(/^\/guest_lecturer/, '/unit_coordinator');
      return withAuthCookies(
        NextResponse.redirect(new URL(target + request.nextUrl.search, request.url)),
        authResponse,
      );
    }

    // No role at all. Refuse rather than guess one; the backend refuses
    // these calls independently.
    return withAuthCookies(
      new NextResponse('Your account does not have access to this dashboard.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      }),
      authResponse,
    );
  }

  // Dashboard pages show the signed-in user's data, so the browser must not
  // keep a copy. Without this, Back after logging out shows the old page from
  // the browser's cache instead of asking here, where it would go to login.
  authResponse.headers.set('Cache-Control', 'no-store');
  return authResponse;
}

export const config = {
  // Left out: static assets, and the files a browser fetches before anyone has
  // signed in, or from a background process with no session: the install
  // manifest, the service worker, the favicon and the icons, drawn or stored.
  // Each name has to be the whole first segment, so a route that merely starts
  // with one is still checked.
  matcher: [
    '/((?!(?:_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|icon|push-badge|manifest\\.webmanifest|sw\\.js)(?:/|$)).*)',
  ],
};
