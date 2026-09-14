import type { ApiErrorResponse } from "@/types/api/apiTypes";

/**
 * The single door between browser code and the NestJS API.
 *
 * Requests go to /api/backend/... on our own origin, and the route handler
 * there attaches the access token from the HttpOnly cookie. Nothing in the
 * browser ever holds the token, which is what makes checklist items TAM-01
 * and TAM-02 true rather than aspirational.
 *
 * It also means these calls are same-origin and never touch CORS.
 */

/** A non-2xx response, carrying the SAS §2.5.5 envelope the backend sends. */
export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;

  constructor(status: number, body: Partial<ApiErrorResponse>) {
    super(body.message ?? "The request could not be completed.");
    this.name = "BackendError";
    this.status = status;
    this.code = body.code ?? "UNKNOWN";
    this.correlationId = body.correlationId;
  }
}

/**
 * Calls the backend as the signed-in user.
 *
 * @param path Path on the API, e.g. "/auth/whoami".
 * @throws BackendError on any non-2xx response.
 */
export async function backendFetch<TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers,
    // Same-origin, and the session cookie is what identifies the caller to
    // our own route handler.
    credentials: "same-origin",
  });

  // The session is gone or expired. Clear the UI rather than leaving it
  // showing a signed-in state whose every request fails.
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(
      `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`,
    );
  }

  if (!response.ok) {
    throw new BackendError(response.status, await readErrorBody(response));
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

/**
 * The backend answers errors with the four-field envelope, but a proxy or a
 * crash can produce something else. Parsing an error body must never throw and
 * hide the real failure.
 */
async function readErrorBody(response: Response): Promise<Partial<ApiErrorResponse>> {
  try {
    return (await response.json()) as Partial<ApiErrorResponse>;
  } catch {
    return { message: `Request failed with status ${response.status}.` };
  }
}
