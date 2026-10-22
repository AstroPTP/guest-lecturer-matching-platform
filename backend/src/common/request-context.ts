import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What is known about the request being served, reachable from code that was
 * never handed the request: a service, a guard helper, an audit write.
 *
 * Held in AsyncLocalStorage, which follows a request through every `await` it
 * makes, so two requests in flight at once each read their own values.
 */
export interface RequestContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Header carrying the id from the frontend proxies and back to them. */
export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Runs `work`, and everything it starts, with `context` as the current
 * request. Used by the middleware; tests use it to stand in for a request.
 */
export function runInRequestContext<T>(
  context: RequestContext,
  work: () => T,
): T {
  return storage.run(context, work);
}

/**
 * The current request's correlation id, or undefined outside a request: a
 * scheduled job, the one-shot retention command, or a test with no request.
 */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * The inbound id if it is safe to reuse, otherwise undefined.
 *
 * Reused so one identifier follows a request across the frontend and backend
 * logs. Length-capped and limited to word characters and
 * hyphens because the value is echoed in a response header, written to logs
 * and stored in the audit trail: an unbounded client-supplied string is a
 * log-injection and storage problem, and a newline in it would forge a line.
 */
export function acceptInboundCorrelationId(
  inbound: unknown,
): string | undefined {
  return typeof inbound === 'string' && /^[\w-]{1,64}$/.test(inbound)
    ? inbound
    : undefined;
}
