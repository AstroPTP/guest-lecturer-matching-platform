/**
 * Error codes returned by the API.
 *
 * The frontend branches on these, so they are part of the API contract and
 * must not be reworded. The human-readable message beside them may change.
 */
export const ErrorCode = {
  /** No Authorization header, or one that is not a well-formed bearer token. */
  AuthMissingBearer: 'AUTH_MISSING_BEARER',
  /** Signature, issuer, audience or expiry check failed. */
  AuthInvalidToken: 'AUTH_INVALID_TOKEN',
  /** Token is valid, but the caller's roles do not permit this route. */
  AuthzInsufficientRole: 'AUTHZ_INSUFFICIENT_ROLE',
  /** Request body failed validation. */
  ValidationFailed: 'VALIDATION_FAILED',
  /** Rate limit exceeded. */
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  /** Request body exceeded the configured size limit. */
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  /** Token is valid, but no user row exists for this Auth0 subject yet. */
  UserProfileNotFound: 'USER_PROFILE_NOT_FOUND',
  /** Anything unhandled. Never carries detail to the client. */
  InternalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * The response envelope. Exactly these four fields reach the client: no stack,
 * no path, no SQL, no dependency name (INF-01).
 */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  correlationId: string;
  timestamp: string;
}
