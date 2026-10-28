import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  forwardedHeaders as studentHeaders,
  unreachableBackendLogLine as studentLogLine,
} from '../../../frontend/src/lib/api/proxyRequest';
import {
  forwardedHeaders as adminHeaders,
  unreachableBackendLogLine as adminLogLine,
} from '../../../frontend/admin/lib/api/proxyRequest';

/**
 * The two Next proxies (student app and administrator portal) share their
 * request rules as a small module each. The frontends have no test runner of
 * their own, so the rules are pinned here, where the repository's tests run.
 */
const SOURCES = {
  'student app': '../../../frontend/src/lib/api/proxyRequest.ts',
  'administrator portal': '../../../frontend/admin/lib/api/proxyRequest.ts',
};

const ROUTES = {
  'student app': '../../../frontend/src/app/api/backend/[...path]/route.ts',
  'administrator portal':
    '../../../frontend/admin/app/api/backend/[...path]/route.ts',
};

describe.each([
  ['student app', studentHeaders],
  ['administrator portal', adminHeaders],
])('the %s proxy request headers', (_app, forwardedHeaders) => {
  it('never passes on the browser’s own credentials', () => {
    const sent = forwardedHeaders(
      new Headers({ Authorization: 'Bearer stolen', Cookie: 'session=1' }),
    );

    expect(sent.has('authorization')).toBe(false);
    expect(sent.has('cookie')).toBe(false);
  });

  it('drops the hop-by-hop headers and keeps the ones the API needs', () => {
    const sent = forwardedHeaders(
      new Headers({
        Connection: 'keep-alive',
        Host: 'app.example',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }),
    );

    expect([...sent.keys()].sort()).toEqual(['accept', 'content-type']);
  });
});

describe.each([
  ['student app', studentLogLine],
  ['administrator portal', adminLogLine],
])('the %s proxy log line for an unreachable API', (_app, logLine) => {
  const now = new Date('2026-10-20T01:02:03.000Z');

  it('is one line of JSON with the id, method, path and error message', () => {
    const line = logLine({
      correlationId: 'c0ffee00-0000-4000-8000-000000000001',
      method: 'POST',
      path: '/admin/audit-entries',
      error: new TypeError('fetch failed'),
      now,
    });

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      ts: '2026-10-20T01:02:03.000Z',
      event: 'backend_unreachable',
      correlationId: 'c0ffee00-0000-4000-8000-000000000001',
      method: 'POST',
      path: '/admin/audit-entries',
      error: 'fetch failed',
    });
  });

  it('stays one line when the error message holds line breaks', () => {
    const line = logLine({
      correlationId: 'id-1',
      method: 'GET',
      path: '/users/me',
      error: new Error('first\nFAKE LOG LINE'),
    });

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({ error: 'first\nFAKE LOG LINE' });
  });

  it('reads a thrown value that is not an Error as text', () => {
    const line = logLine({
      correlationId: 'id-2',
      method: 'GET',
      path: '/users/me',
      error: 'socket hang up',
    });

    expect(JSON.parse(line)).toMatchObject({ error: 'socket hang up' });
  });

  it('carries nothing but its six fields, so no stack, header or body is logged', () => {
    const error = Object.assign(new Error('refused'), {
      stack: 'Error: refused\n    at secret-file.ts:1:1',
      cause: { token: 'Bearer abc' },
    });
    const line = logLine({
      correlationId: 'id-3',
      method: 'GET',
      path: '/users/me',
      error,
    });

    expect(Object.keys(JSON.parse(line) as object).sort()).toEqual([
      'correlationId',
      'error',
      'event',
      'method',
      'path',
      'ts',
    ]);
    expect(line).not.toContain('secret-file');
    expect(line).not.toContain('Bearer');
  });
});

describe.each(Object.entries(ROUTES))(
  'the %s proxy route when the API cannot be reached',
  (_app, path) => {
    const source = readFileSync(join(__dirname, path), 'utf8');

    it('logs the failure instead of discarding it', () => {
      expect(source).toContain('console.error(');
      expect(source).toContain('unreachableBackendLogLine(');
      expect(source).not.toContain('.catch(() => null)');
    });

    it('logs the same id it shows the user, in the body and in the header', () => {
      // Once in the log call and once in the 502 body.
      expect(source.match(/correlationId: proxyId/g)).toHaveLength(2);
      expect(source).toContain("headers: { 'x-correlation-id': proxyId }");
    });

    it('logs the path without the query string', () => {
      expect(source).toContain("path: `/${path.join('/')}`");
    });
  },
);

it('keeps the two proxies’ request rules identical', () => {
  const [student, admin] = Object.values(SOURCES).map((path) =>
    readFileSync(join(__dirname, path), 'utf8'),
  );

  expect(admin).toBe(student);
});
