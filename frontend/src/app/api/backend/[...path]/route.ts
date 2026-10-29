import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isSafeProxyPath } from '@/lib/api/proxyPath';
import { backendUrl } from '@/lib/auth/config';
import {
  forwardedHeaders,
  unreachableBackendLogLine,
  upstreamPath,
} from '@/lib/api/proxyRequest';
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

/** The id the backend gave the request, to hand back so the browser can quote it. */
function correlationHeader(response: Response): Record<string, string> {
  const id = response.headers.get('x-correlation-id');
  return id ? { 'x-correlation-id': id } : {};
}

/**
 * Everything this route returns is per-user and must not be kept by a shared
 * cache, so every response, including the errors built here, says so. The
 * headers passed through from the API are chosen one by one below; nothing
 * that would allow shared caching (Cache-Control, ETag, Last-Modified) is
 * among them.
 */
const NO_SHARED_CACHE = 'private, no-store';

/** A response built here rather than passed through from the API. */
function refuse(
  body: Record<string, string>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': NO_SHARED_CACHE, ...extraHeaders },
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

  const headers = forwardedHeaders(request.headers);

  headers.set('Authorization', `Bearer ${token}`);

  // The backend gives the request its id and sends it back in the response,
  // and the proxy passes it on. This one is only for the 502 below, when there
  // is no backend response to take an id from. It is shown to the user and
  // written to the log, so the two can be matched.
  const proxyId = randomUUID();

  const target = `${backendUrl()}/${upstreamPath(path)}${request.nextUrl.search}`;

  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.arrayBuffer();

  let response: Response;
  try {
    response = await fetch(target, {
      cache: 'no-store',
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (error) {
    console.error(
      unreachableBackendLogLine({
        correlationId: proxyId,
        method: request.method,
        path: `/${path.join('/')}`,
        error,
      }),
    );
    return refuse(
      {
        code: 'BACKEND_UNREACHABLE',
        message: 'The API is not responding.',
        correlationId: proxyId,
        timestamp: new Date().toISOString(),
      },
      502,
      { 'x-correlation-id': proxyId },
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
  Object.assign(passed, correlationHeader(response));
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
