import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { monitoringStore } from '../../monitoring/monitoring.store';
import { ErrorCode, ErrorEnvelope } from '../error-codes';
import {
  acceptInboundCorrelationId,
  CORRELATION_HEADER,
  currentCorrelationId,
} from '../request-context';

/**
 * Turns every error into the four-field envelope.
 *
 * Two obligations, pulling in opposite directions, and both have to be met:
 *
 *   - the client gets exactly four fields and nothing else: no stack, no file
 *     path, no SQL, no dependency name;
 *   - the server log keeps the full detail, or nothing is diagnosable.
 *
 * The correlation id appears in both, so a user quoting the id from their
 * error screen can be matched to the stack trace that produced it. It is the
 * same id the request's JSON log line and any audit entry carry.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const correlationId = resolveCorrelationId(request);
    const status = resolveStatus(exception);
    const { code, message } = resolveCodeAndMessage(exception, status);

    // Method and path only. Never the body, the query string or the headers.
    // Request payloads and credentials must not be logged, and an
    // Authorization header in a log file is a credential at rest.
    const context = `${request.method} ${request.path} -> ${status} ${code} [${correlationId}]`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        context,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(context);
    }

    // Feeds the administrator's security signals. Kept out of the way of the
    // response: a fault in the monitoring code must never be the reason a
    // client does not get its error.
    try {
      monitoringStore.record({
        status,
        method: request.method,
        path: request.path,
        userId: numericUserIdOf(request),
      });
    } catch {
      // Deliberately silent. Logging here would spend a line on every request
      // if the fault were persistent.
    }

    // DOS-08. A 429 without Retry-After leaves a well-behaved client guessing,
    // so it retries immediately and stays limited. 60 matches the ttl on both
    // throttler tiers: the 60/min global default and the 10/min on /auth.
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      response.setHeader('Retry-After', '60');
    }

    const body: ErrorEnvelope = {
      code,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}

/**
 * The caller's internal numeric id, only if the authenticated user carries
 * one, otherwise null.
 *
 * AuthenticatedUser.id is the Auth0 subject string, which is an identifier for
 * a person and is not copied into the monitoring record. A numeric id would
 * only appear if the guards one day attach the users.userid.
 */
function numericUserIdOf(request: Request): number | null {
  const user = (request as { user?: { id?: unknown } }).user;
  return typeof user?.id === 'number' && Number.isSafeInteger(user.id)
    ? user.id
    : null;
}

/**
 * The id the request middleware already settled on, so the envelope, the log
 * line and the response header all agree.
 *
 * The rest is for an error that arrives with no request context, which means
 * the middleware did not run for it: reuse a well-formed inbound id and
 * otherwise mint one, so an envelope never goes out without an id.
 */
function resolveCorrelationId(request: Request): string {
  return (
    currentCorrelationId() ??
    acceptInboundCorrelationId(request.header(CORRELATION_HEADER)) ??
    randomUUID()
  );
}

function resolveStatus(exception: unknown): HttpStatus {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  // Express middleware throws plain errors carrying a status rather than a
  // Nest HttpException. body-parser's PayloadTooLargeError is the one we hit
  // in practice. Without this, an oversized body reports 500 INTERNAL_ERROR,
  // which reads as a server fault when it was the caller's request that was
  // rejected, and hides a control that is in fact working (DOS-10).
  return clientErrorStatusOf(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * A 4xx carried on a non-HttpException, or undefined.
 *
 * Restricted to 4xx deliberately: a 5xx thrown by library internals is still
 * an unexpected server error and should be reported as one, with its detail
 * kept server-side.
 */
function clientErrorStatusOf(exception: unknown): HttpStatus | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }

  const candidate = exception as { status?: unknown; statusCode?: unknown };
  const raw =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : undefined;

  return raw !== undefined && raw >= 400 && raw < 500 ? raw : undefined;
}

/**
 * Guards throw `{ code, message }`; the rest of Nest throws plain strings or
 * its own shapes. Both end up as an envelope.
 */
function resolveCodeAndMessage(
  exception: unknown,
  status: HttpStatus,
): { code: ErrorCode; message: string } {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const candidate = payload as { code?: unknown; message?: unknown };

      if (typeof candidate.code === 'string') {
        return {
          code: candidate.code as ErrorCode,
          message:
            typeof candidate.message === 'string'
              ? candidate.message
              : defaultMessageFor(status),
        };
      }
    }

    return { code: defaultCodeFor(status), message: defaultMessageFor(status) };
  }

  // Not an HttpException, but resolveStatus recognised a 4xx on it: an
  // Express middleware error such as body-parser's PayloadTooLargeError. The
  // caller gets the code matching that status, but never the library's own
  // message, which names internals.
  if (
    status >= HttpStatus.BAD_REQUEST &&
    status < HttpStatus.INTERNAL_SERVER_ERROR
  ) {
    return { code: defaultCodeFor(status), message: defaultMessageFor(status) };
  }

  // Unhandled. The detail goes to the log above; the client is told nothing
  // beyond that it failed.
  return {
    code: ErrorCode.InternalError,
    message: 'An unexpected error occurred',
  };
}

function defaultCodeFor(status: HttpStatus): ErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.AuthInvalidToken;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.AuthzInsufficientRole;
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.ValidationFailed;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NotFound;
    case HttpStatus.CONFLICT:
      return ErrorCode.Conflict;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RateLimitExceeded;
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return ErrorCode.PayloadTooLarge;
    default:
      return ErrorCode.InternalError;
  }
}

function defaultMessageFor(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'Authentication required';
    case HttpStatus.FORBIDDEN:
      return 'You do not have permission to perform this action';
    case HttpStatus.BAD_REQUEST:
      return 'The request could not be processed';
    case HttpStatus.NOT_FOUND:
      return 'The requested resource was not found';
    case HttpStatus.CONFLICT:
      return 'The request conflicts with the current state of the resource';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too many requests';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'The request body is too large';
    default:
      return 'An unexpected error occurred';
  }
}
