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
import { ErrorCode, ErrorEnvelope } from '../error-codes';

/**
 * Turns every error into the four-field envelope.
 *
 * Two obligations, pulling in opposite directions, and both have to be met:
 *
 *   - the client gets exactly four fields and nothing else: no stack, no file
 *     path, no SQL, no dependency name (INF-01);
 *   - the server log keeps the full detail, or nothing is diagnosable
 *     (checklist INF-02).
 *
 * The correlation id appears in both, so a user quoting the id from their
 * error screen can be matched to the stack trace that produced it.
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
    // Authorization header in a log file is a credential at rest (INF-06).
    const context = `${request.method} ${request.path} -> ${status} ${code} [${correlationId}]`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        context,
        exception instanceof Error ? exception.stack : String(exception),
      );

      // TEMP debugging — remove after diagnosing
      if (exception && typeof exception === 'object' && 'code' in exception) {
        console.error('PRISMA CODE:', (exception as any).code);
        console.error('PRISMA META:', (exception as any).meta);
      }
    } else {
      this.logger.warn(context);
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
 * Reuses an inbound correlation id so one identifier follows a request across
 * the frontend and backend logs (checklist REP-06), and mints one otherwise.
 *
 * Length-capped because this value is echoed back and written to logs, and an
 * unbounded client-supplied string is a log-injection and storage problem.
 */
function resolveCorrelationId(request: Request): string {
  const inbound = request.header('x-correlation-id');

  if (typeof inbound === 'string' && /^[\w-]{1,64}$/.test(inbound)) {
    return inbound;
  }

  return randomUUID();
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
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too many requests';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'The request body is too large';
    default:
      return 'An unexpected error occurred';
  }
}
