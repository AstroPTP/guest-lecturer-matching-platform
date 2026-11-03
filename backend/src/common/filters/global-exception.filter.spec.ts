import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { monitoringStore } from '../../monitoring/monitoring.store';
import { runInRequestContext } from '../request-context';
import { GlobalExceptionFilter } from './global-exception.filter';

/** A minimal Express request/response pair, enough for the filter. */
function run(
  exception: unknown,
  headers: Record<string, string> = {},
  requestOverrides: Record<string, unknown> = {},
) {
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
    ...requestOverrides,
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
  monitoringStore.reset();
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

  it('gives a 404 the code NOT_FOUND, not INTERNAL_ERROR', () => {
    const sent = run(new NotFoundException('No user with that id.'));

    expect(sent.status).toBe(404);
    expect(sent.body).toMatchObject({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    });
    expect(Object.keys(sent.body ?? {}).sort()).toEqual([
      'code',
      'correlationId',
      'message',
      'timestamp',
    ]);
  });

  it('gives a 409 the code CONFLICT', () => {
    const sent = run(new ConflictException('duplicate key value'));

    expect(sent.status).toBe(409);
    expect(sent.body?.code).toBe('CONFLICT');
    expect(JSON.stringify(sent.body)).not.toContain('duplicate key');
  });

  it('keeps a code a service supplied on a 404 or a 409', () => {
    const missing = run(
      new NotFoundException({
        code: 'GUEST_NOT_FOUND',
        message: 'No such guest',
      }),
    );
    const clash = run(
      new ConflictException({
        code: 'CONTACT_LIMIT_REACHED',
        message: 'Contacted recently',
      }),
    );

    expect(missing.body).toMatchObject({
      code: 'GUEST_NOT_FOUND',
      message: 'No such guest',
    });
    expect(clash.body).toMatchObject({
      code: 'CONTACT_LIMIT_REACHED',
      message: 'Contacted recently',
    });
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'AUTH_INVALID_TOKEN'],
    [403, 'AUTHZ_INSUFFICIENT_ROLE'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMIT_EXCEEDED'],
    [500, 'INTERNAL_ERROR'],
    [503, 'INTERNAL_ERROR'],
  ])('answers a plain HttpException with status %i as %s', (status, code) => {
    const sent = run(new HttpException('anything', status));

    expect(sent.status).toBe(status);
    expect(sent.body?.code).toBe(code);
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

  it.each([
    ['well-formed', 'abc-123_DEF'],
    ['too long', 'a'.repeat(65)],
    ['a log-injection attempt', 'abc\nFAKE LOG LINE'],
    ['unexpected characters', '<script>'],
  ])('ignores an inbound correlation id that is %s', (_label, inbound) => {
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

describe('GlobalExceptionFilter request context', () => {
  const inContext = (id: string, work: () => void) =>
    runInRequestContext({ correlationId: id }, work);

  it('answers with the id the request middleware settled on', () => {
    let sent: ReturnType<typeof run> | undefined;
    inContext('01HZX3K9QJ0000000000000000', () => {
      sent = run(new BadRequestException());
    });

    expect(sent?.body?.correlationId).toBe('01HZX3K9QJ0000000000000000');
  });

  it('answers with the context id whatever header the caller sent, so envelope and log line agree', () => {
    let sent: ReturnType<typeof run> | undefined;
    inContext('from-context', () => {
      sent = run(new BadRequestException(), {
        'x-correlation-id': 'from-header',
      });
    });

    expect(sent?.body?.correlationId).toBe('from-context');
  });

  it('puts the context id in the server log line too', () => {
    inContext('from-context', () => {
      run(new Error('boom'));
    });

    expect(logged.join('\n')).toContain('[from-context]');
  });

  it('keeps the four-field envelope when it takes the id from the context', () => {
    let sent: ReturnType<typeof run> | undefined;
    inContext('from-context', () => {
      sent = run(new Error('boom'));
    });

    expect(Object.keys(sent?.body ?? {}).sort()).toEqual([
      'code',
      'correlationId',
      'message',
      'timestamp',
    ]);
  });

  it('falls back to a UUID when there is no request context', () => {
    const sent = run(new BadRequestException());

    expect(sent.body?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GlobalExceptionFilter monitoring', () => {
  it('records a server error in the store, without the query string', () => {
    run(new Error('boom'));

    const [event] = monitoringStore.recent(1);
    expect(event).toMatchObject({
      status: 500,
      category: 'server_error',
      method: 'POST',
      path: '/settings/password',
      userId: null,
    });
    expect(JSON.stringify(event)).not.toContain('secret-in-query');
  });

  it('still never logs the query string once it is recording', () => {
    run(new Error('boom'));

    expect(logged.join('\n')).toContain('POST /settings/password');
    expect(logged.join('\n')).not.toContain('secret-in-query');
  });

  it.each([
    [
      '401 on any path',
      new UnauthorizedException(),
      '/users/me',
      'auth_failure',
    ],
    [
      '403 on an admin route',
      new ForbiddenException(),
      '/admin/users',
      'admin_forbidden',
    ],
    [
      '429 from the throttler',
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      '/auth/login',
      'rate_limited',
    ],
  ])('records %s', (_label, exception, path, category) => {
    run(exception, {}, { path });

    expect(monitoringStore.recent(5).map((e) => e.category)).toEqual([
      category,
    ]);
  });

  it.each([
    ['a 403 outside /admin', new ForbiddenException(), '/users/me'],
    ['a 400', new BadRequestException(), '/users/me'],
    ['a 404', new HttpException('Not Found', HttpStatus.NOT_FOUND), '/nowhere'],
  ])('does not record %s', (_label, exception, path) => {
    run(exception, {}, { path });

    expect(monitoringStore.recent(5)).toEqual([]);
  });

  it('takes the user id only when the request user carries a numeric one', () => {
    run(new Error('a'), {}, { user: { id: 42 } });
    // The real AuthenticatedUser.id is the Auth0 subject string. It identifies
    // a person and is not copied into the monitoring record.
    run(new Error('b'), {}, { user: { id: 'auth0|65f1a' } });
    run(new Error('c'));

    expect(monitoringStore.recent(5).map((e) => e.userId)).toEqual([
      null,
      null,
      42,
    ]);
    expect(JSON.stringify(monitoringStore.recent(5))).not.toContain('auth0');
  });

  it('answers exactly as before when the store throws', () => {
    jest.spyOn(monitoringStore, 'record').mockImplementation(() => {
      throw new Error('store is broken');
    });

    const sent = run(new Error('boom'));

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
    expect(logged.join('\n')).toContain('POST /settings/password -> 500');
  });

  it('still sets Retry-After on a 429 when the store throws', () => {
    jest.spyOn(monitoringStore, 'record').mockImplementation(() => {
      throw new Error('store is broken');
    });

    const sent = run(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );

    expect(sent.status).toBe(429);
    expect(sent.headers['Retry-After']).toBe('60');
  });
});
