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
  /** The caller's own account is on hold, so they cannot send or accept requests. */
  AccountOnHold: 'ACCOUNT_ON_HOLD',
  /** Request body failed validation. */
  ValidationFailed: 'VALIDATION_FAILED',
  /** The route or the record it names does not exist. */
  NotFound: 'NOT_FOUND',
  /** The request is well-formed but clashes with the current state of the record. */
  Conflict: 'CONFLICT',
  /** Rate limit exceeded. */
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  /** Request body exceeded the configured size limit. */
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  /** Registration for an email that already has an account. */
  AccountExists: 'ACCOUNT_EXISTS',
  /** The current password given to confirm a settings change is wrong. */
  InvalidCurrentPassword: 'INVALID_CURRENT_PASSWORD',
  /** Anything unhandled. Never carries detail to the client. */
  InternalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * The response envelope. Exactly these four fields reach the client: no stack,
 * no path, no SQL, no dependency name.
 */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  correlationId: string;
  timestamp: string;
}
