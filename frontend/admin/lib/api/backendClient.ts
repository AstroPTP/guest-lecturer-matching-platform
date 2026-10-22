/**
 * The single door between the portal and the API.
 *
 * Calls go to /api/backend on this origin; the route handler there attaches
 * the access token server-side. Nothing in the browser holds a credential, and
 * because the request is same-origin it never touches CORS.
 */

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;

  constructor(status: number, body: Partial<{ code: string; message: string; correlationId: string }>) {
    super(body.message ?? 'The request could not be completed.');
    this.name = 'BackendError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.correlationId = body.correlationId;
  }
}

export async function backendFetch<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // A non-JSON error body is still an error; the status carries the meaning.
    }
    throw new BackendError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
