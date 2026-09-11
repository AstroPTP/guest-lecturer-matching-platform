/**
 * The error shape the NestJS API returns.
 *
 * Exactly these four fields reach the client on a failure. The backend's global
 * exception filter guarantees it, so anything calling the API can rely on the
 * shape without inspecting the status code first.
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
}
