import { NextResponse } from 'next/server';
import { authOrigin, devLoginEnabled } from '@/lib/auth/config';

/**
 * The dev IdP's test accounts, for the demo login's picker.
 *
 * Proxied rather than fetched from the browser so the identity provider's
 * address stays server-side, and so this disappears with the same switch that
 * disables the dev login itself.
 */
export async function GET() {
  if (!devLoginEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const response = await fetch(`${authOrigin()}/dev/users`).catch(() => null);
  if (!response?.ok) {
    return NextResponse.json([], { status: 502 });
  }

  return NextResponse.json(await response.json());
}
