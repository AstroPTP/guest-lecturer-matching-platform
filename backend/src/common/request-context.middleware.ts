import type { NextFunction, Request, Response } from 'express';
import {
  acceptInboundCorrelationId,
  CORRELATION_HEADER,
  runInRequestContext,
} from './request-context';
import { ulid } from './ulid';

/** One finished request, as written to the log. */
export interface RequestLogLine {
  ts: string;
  correlationId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

export interface RequestContextOptions {
  /** Receives each finished line, newline-free. Defaults to standard output. */
  write?: (line: string) => void;
  /** Milliseconds from any fixed starting point; a parameter so a test can fix it. */
  now?: () => number;
}

/**
 * Probe paths, never logged. A host probes on a fixed beat and an uptime
 * monitor does the same, so logging them would bury every real request.
 */
const UNLOGGED_PATHS = new Set(['/healthz', '/readyz']);

/**
 * Longest path written to the log. An unmatched path is whatever the caller
 * typed, and a scanner can type a great deal.
 */
const MAX_LOGGED_PATH = 200;

/**
 * Gives every request one correlation id and one log line.
 *
 * The id is the caller's if it is well-formed, otherwise a fresh ULID. It goes
 * on the response, so a client can quote it, into the request context, so the
 * error filter and the audit trail can read it without being handed the
 * request, and into the line written when the response finishes.
 *
 * Registered first in main.ts. That way a request refused before it reaches a
 * controller (a CORS preflight, an oversized body, a missing route) still has
 * an id and still has a line.
 *
 * The line carries the method, the route and the status, and nothing the
 * caller sent: no query string, no body, no headers, no token (INF-06).
 * Aborted connections never emit `finish` and so are not logged.
 */
export function requestContextMiddleware(options: RequestContextOptions = {}) {
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => performance.now());

  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = now();
    const correlationId =
      acceptInboundCorrelationId(request.header(CORRELATION_HEADER)) ?? ulid();

    response.setHeader(CORRELATION_HEADER, correlationId);

    response.once('finish', () => {
      if (UNLOGGED_PATHS.has(pathOf(request))) return;

      const line: RequestLogLine = {
        ts: new Date().toISOString(),
        correlationId,
        method: request.method,
        route: routeOf(request),
        status: response.statusCode,
        durationMs: Math.round((now() - startedAt) * 10) / 10,
      };

      // A fault in the log must never be the reason a response fails; by the
      // time this runs the response has already gone.
      try {
        write(JSON.stringify(line));
      } catch {
        // Deliberately silent: reporting it would need the same broken sink.
      }
    });

    runInRequestContext({ correlationId }, next);
  };
}

/**
 * The URL's path without its query string. Taken from originalUrl, which no
 * router rewrites, rather than `path`, which is relative to wherever the
 * request has got to.
 */
function pathOf(request: Request): string {
  const url = request.originalUrl;
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

/**
 * The route pattern that matched, such as /admin/users/:id, so one line per
 * request groups by endpoint instead of by every id that was ever requested.
 * Where nothing matched (a 404, or a failure before routing) it is the path.
 */
function routeOf(request: Request): string {
  const matched: unknown = (request.route as { path?: unknown } | undefined)
    ?.path;

  if (typeof matched === 'string') {
    return `${request.baseUrl}${matched}`;
  }

  return pathOf(request).slice(0, MAX_LOGGED_PATH);
}
