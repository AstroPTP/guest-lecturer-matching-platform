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
    } else {
      this.logger.warn(context);
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
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
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
    default:
      return 'An unexpected error occurred';
  }
}
