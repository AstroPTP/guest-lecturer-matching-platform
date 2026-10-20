/**
 * Rejects if `work` has not settled within `ms`.
 *
 * Used where an answer that arrives late is worth no more than no answer, such
 * as a readiness probe: a database that takes ten seconds to say "yes" is not
 * ready. The timer is always cleared, so a fast answer leaves nothing behind to
 * keep the process or a test alive, and `unref` keeps a pending timer from
 * holding the process open at shutdown.
 *
 * The underlying work is not cancelled, only abandoned. For a single SELECT
 * that is harmless, and its eventual result or error is swallowed here so a
 * late rejection cannot surface as an unhandled rejection.
 */
export function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
    timer.unref();
  });

  const settled = Promise.resolve(work);
  settled.catch(() => undefined);

  return Promise.race([settled, expiry]).finally(() => clearTimeout(timer));
}
