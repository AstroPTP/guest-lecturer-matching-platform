import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isSafeProxyPath } from '@/lib/api/proxyPath';
import { backendUrl } from '@/lib/auth/config';
import { readAccessToken } from '@/lib/auth/session';

/**
 * Backend-for-frontend proxy.
 *
 * Every browser call to the NestJS API goes through here. The route reads the
 * access token from the HttpOnly cookie and attaches it as a bearer token
 * server-side, so the token is never handed to JavaScript at all.
 *
 * Two things fall out of that, and both are the reason for the design:
 *
 *   - TAM-01 and TAM-02 genuinely hold. The token cannot be read from
 *     document.cookie, cannot be stolen by injected script, and never appears
 *     in a JS variable.
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
  // Conditional requests would let the API answer 304 with no body, which is
  // not what a no-store response should be built from.
  'if-none-match',
  'if-modified-since',
  'if-match',
  'if-unmodified-since',
  'if-range',
]);

/**
 * Everything this route returns is per-user and must not be kept by a shared
 * cache, so every response, including the errors built here, says so. The
 * headers passed through from the API are chosen one by one below; nothing
 * that would allow shared caching (Cache-Control, ETag, Last-Modified) is
 * among them.
 */
const NO_SHARED_CACHE = 'private, no-store';

/** A response built here rather than passed through from the API. */
function refuse(body: Record<string, string>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': NO_SHARED_CACHE },
  });
}

async function forward(request: NextRequest, path: string[] | null) {
  // Checked before anything else, and before the API is called. A segment that
  // is a dot segment or holds a separator could make this server request a
  // different route from the one the browser asked for.
  if (!path || !isSafeProxyPath(path)) {
    return refuse(
      { code: 'VALIDATION_FAILED', message: 'The request path is not valid.' },
      400,
    );
  }

  const token = await readAccessToken();

  // No session, or it could not be refreshed. Answer here rather than sending
  // an unauthenticated call the backend would refuse anyway; backendFetch
  // turns this 401 into a redirect to /login.
  if (!token) {
    return refuse(
      { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' },
      401,
    );
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  headers.set('Authorization', `Bearer ${token}`);

  // Echoed back by the backend's GlobalExceptionFilter, so an id on a user's
  // error screen matches the server log line that produced it (REP-06).
  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', randomUUID());
  }

  const target = `${backendUrl()}/${path.join('/')}${request.nextUrl.search}`;

  const response = await fetch(target, {
    cache: 'no-store',
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    redirect: 'manual',
  }).catch(() => null);

  if (!response) {
    return refuse(
      {
        code: 'BACKEND_UNREACHABLE',
        message: 'The API is not responding.',
        correlationId: headers.get('x-correlation-id') ?? '',
        timestamp: new Date().toISOString(),
      },
      502,
    );
  }

  // Pass the body and status straight through so the error envelope the
  // backend produced reaches the client unchanged.
  const passed: Record<string, string> = {
    'Content-Type': response.headers.get('content-type') ?? 'application/json',
    'Cache-Control': NO_SHARED_CACHE,
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

/**
 * The path segments, or null when they cannot be read, for instance because
 * one is not valid percent-encoding. Null is answered with a 400 like any
 * other path that is not valid.
 */
async function pathOf(context: Context): Promise<string[] | null> {
  try {
    return (await context.params).path;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, context: Context) {
  return forward(request, await pathOf(context));
}

export async function POST(request: NextRequest, context: Context) {
  return forward(request, await pathOf(context));
}

export async function PATCH(request: NextRequest, context: Context) {
  return forward(request, await pathOf(context));
}

export async function PUT(request: NextRequest, context: Context) {
  return forward(request, await pathOf(context));
}

export async function DELETE(request: NextRequest, context: Context) {
  return forward(request, await pathOf(context));
}
