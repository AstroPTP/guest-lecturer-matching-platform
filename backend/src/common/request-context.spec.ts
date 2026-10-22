import {
  acceptInboundCorrelationId,
  currentCorrelationId,
  runInRequestContext,
} from './request-context';

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

describe('acceptInboundCorrelationId', () => {
  it.each(['abc-123_DEF', 'a', 'a'.repeat(64), '01HZX3K9QJ0000000000000000'])(
    'accepts %s',
    (id) => {
      expect(acceptInboundCorrelationId(id)).toBe(id);
    },
  );

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['a line break that would forge a log line', 'abc\nFAKE LOG LINE'],
    ['a carriage return', 'abc\rdef'],
    ['markup', '<script>'],
    ['a space', 'has space'],
    ['not a string', 42],
    ['absent', undefined],
    ['a repeated header', ['a', 'b']],
  ])('rejects an id that is %s', (_label, id) => {
    expect(acceptInboundCorrelationId(id)).toBeUndefined();
  });
});
