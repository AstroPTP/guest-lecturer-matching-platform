import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { backendUrl } from '@/lib/auth/config';
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

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  // Never forward a client-supplied Authorization header. The token comes from
  // the cookie; accepting one from the caller would let the browser choose its
  // own credentials and defeat the whole arrangement.
  'authorization',
  'cookie',
]);

async function forward(request: NextRequest, path: string[]) {
  const token = await readAccessToken();

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Echoed back by the backend's GlobalExceptionFilter, so an id on a user's
  // error screen matches the server log line that produced it.
  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', randomUUID());
  }

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
        correlationId: headers.get('x-correlation-id') ?? '',
        timestamp: new Date().toISOString(),
      },
      { status: 502 },
    );
  }

  // Pass the body and status straight through so the error envelope the
  // backend produced reaches the client unchanged.
  const passed: Record<string, string> = {
    'Content-Type': response.headers.get('content-type') ?? 'application/json',
  };
  // A downloaded file arrives with how it may be shown (a PDF is a download,
  // never displayed in the page) and a ban on type sniffing. Dropping either
  // would let the browser decide for itself what the file is.
  for (const name of ['content-disposition', 'x-content-type-options']) {
    const value = response.headers.get(name);
    if (value) passed[name] = value;
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: passed,
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
