import { currentCorrelationId, runInRequestContext } from './request-context';

describe('request context', () => {
  it('has no correlation id outside a request', () => {
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('gives code inside a request the request id, across awaits', async () => {
    const seen = await runInRequestContext(
      { correlationId: 'req-1' },
      async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return currentCorrelationId();
      },
    );

    expect(seen).toBe('req-1');
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('keeps two requests in flight at once apart', async () => {
    const read = (id: string, delayMs: number) =>
      runInRequestContext({ correlationId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return currentCorrelationId();
      });

    const [slow, fast] = await Promise.all([read('slow', 20), read('fast', 1)]);

    expect([slow, fast]).toEqual(['slow', 'fast']);
  });
});
