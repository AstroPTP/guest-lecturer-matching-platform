import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

/** A minimal Express request/response pair, enough for the filter. */
function run(exception: unknown, headers: Record<string, string> = {}) {
  const sent: {
    status?: number;
    body?: Record<string, unknown>;
    headers: Record<string, string>;
  } = {
    headers: {},
  };
  interface FakeResponse {
    status(code: number): FakeResponse;
    json(body: Record<string, unknown>): FakeResponse;
    setHeader(name: string, value: string): void;
  }
  const response: FakeResponse = {
    status(code) {
      sent.status = code;
      return response;
    },
    json(body) {
      sent.body = body;
      return response;
    },
    setHeader(name, value) {
      sent.headers[name] = value;
    },
  };
  const request = {
    method: 'POST',
    path: '/settings/password',
    url: '/settings/password?token=secret-in-query',
    header: (name: string) => headers[name.toLowerCase()],
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  new GlobalExceptionFilter().catch(exception, host);
  return sent;
}

let logged: string[];
beforeEach(() => {
  logged = [];
  const capture = (...parts: unknown[]) => {
    logged.push(parts.map(String).join(' '));
  };
  jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
});
afterEach(() => jest.restoreAllMocks());

describe('GlobalExceptionFilter', () => {
  it('answers an unexpected error with a generic 500 and exactly four fields', () => {
    const sent = run(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 at pg/lib/client.js'),
    );

    expect(sent.status).toBe(500);
    expect(Object.keys(sent.body ?? {}).sort()).toEqual([
      'code',
      'correlationId',
      'message',
      'timestamp',
    ]);
    expect(sent.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(JSON.stringify(sent.body)).not.toMatch(/ECONNREFUSED|pg\/lib|5432/);
  });

  it('passes a guard-style { code, message } through unchanged', () => {
    const sent = run(
      new ForbiddenException({
        code: 'AUTHZ_INSUFFICIENT_ROLE',
        message: 'Not allowed',
      }),
    );
    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({
      code: 'AUTHZ_INSUFFICIENT_ROLE',
      message: 'Not allowed',
    });
  });

  it('gives a plain HttpException the code for its status', () => {
    const sent = run(new BadRequestException('field "x" must be a number'));
    expect(sent.status).toBe(400);
    expect(sent.body?.code).toBe('VALIDATION_FAILED');
  });

  it('tells a rate-limited client when to retry', () => {
    const sent = run(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );
    expect(sent.status).toBe(429);
    expect(sent.headers['Retry-After']).toBe('60');
    expect(sent.body?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it("reports an oversized body as 413, without the library's own message", () => {
    const tooLarge = Object.assign(
      new Error('request entity too large, limit 102400 (raw-body)'),
      {
        status: 413,
        type: 'entity.too.large',
      },
    );
    const sent = run(tooLarge);
    expect(sent.status).toBe(413);
    expect(sent.body?.code).toBe('PAYLOAD_TOO_LARGE');
    expect(JSON.stringify(sent.body)).not.toContain('raw-body');
  });

  it('does not trust a 5xx status carried on a library error', () => {
    const sent = run(
      Object.assign(new Error('upstream detail'), { status: 503 }),
    );
    expect(sent.status).toBe(500);
    expect(sent.body?.code).toBe('INTERNAL_ERROR');
  });

  it('reuses a well-formed inbound correlation id', () => {
    const sent = run(new BadRequestException(), {
      'x-correlation-id': 'abc-123_DEF',
    });
    expect(sent.body?.correlationId).toBe('abc-123_DEF');
  });

  it.each([
    ['too long', 'a'.repeat(65)],
    ['a log-injection attempt', 'abc\nFAKE LOG LINE'],
    ['unexpected characters', '<script>'],
  ])('replaces an inbound correlation id that is %s', (_label, inbound) => {
    const sent = run(new BadRequestException(), {
      'x-correlation-id': inbound,
    });
    expect(sent.body?.correlationId).not.toBe(inbound);
    expect(sent.body?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs the method and path but never the query string', () => {
    run(new BadRequestException());
    expect(logged.join('\n')).toContain('POST /settings/password');
    expect(logged.join('\n')).not.toContain('secret-in-query');
  });
});
