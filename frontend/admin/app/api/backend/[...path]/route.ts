import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { backendUrl } from '@/lib/auth/config';
import { forwardedHeaders } from '@/lib/api/proxyRequest';
import { readAccessToken } from '@/lib/auth/session';

/**
 * Backend-for-frontend proxy for the administrator portal.
 *
 * Same arrangement as the student-facing application, and for the same
 * reason. The portal previously served the raw access token to the browser
 * from /api/auth/token so that client code could call the API cross-origin,
 * which put a credential into JavaScript on the page that manages every
 * account in the system.
 *
 * Every browser call to the NestJS API goes through here. The route reads the
 * access token from the HttpOnly cookie and attaches it as a bearer token
 * server-side, so the token is never handed to JavaScript at all.
 *
 * Two things fall out of that, and both are the reason for the design:
 *
 *   - The token cannot be read from document.cookie, cannot be stolen by
 *     injected script, and never appears in a JS variable.
 *   - Browser traffic is same-origin, so it is not subject to CORS at all.
 *     The backend's CORS allowlist still matters as defence in
 *     depth for anything calling it directly, but the frontend no longer
 *     depends on it.
 *
 * Only the methods the API actually needs are exported. An unexported method
 * is a 405 rather than an open pass-through.
 */

/** The id the backend gave the request, to hand back so the browser can quote it. */
function correlationHeader(response: Response): Record<string, string> {
  const id = response.headers.get('x-correlation-id');
  return id ? { 'x-correlation-id': id } : {};
}

async function forward(request: NextRequest, path: string[]) {
  const token = await readAccessToken();

  const headers = forwardedHeaders(request.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // The backend gives the request its id and sends it back in the response,
  // and the proxy passes it on. This one is only for the 502 below, when there
  // is no backend response to take an id from.
  const proxyId = randomUUID();

  const target = `${backendUrl()}/${path.join('/')}${request.nextUrl.search}`;

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text(),
    redirect: 'manual',
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      {
        code: 'BACKEND_UNREACHABLE',
        message: 'The API is not responding.',
        correlationId: proxyId,
        timestamp: new Date().toISOString(),
      },
      { status: 502, headers: { 'x-correlation-id': proxyId } },
    );
  }

  // Pass the body and status straight through so the error envelope the
  // backend produced reaches the client unchanged.
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      ...correlationHeader(response),
    },
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
