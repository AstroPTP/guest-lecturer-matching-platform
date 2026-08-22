import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/config';

/**
 * Clears the session cookie.
 *
 * POST rather than GET on purpose: a GET logout can be triggered by any page
 * that embeds an image pointing at it, which is a nuisance CSRF.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
