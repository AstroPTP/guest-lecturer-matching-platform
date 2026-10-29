import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  forwardedHeaders as studentHeaders,
  upstreamPath as studentPath,
  unreachableBackendLogLine as studentLogLine,
} from '../../../frontend/src/lib/api/proxyRequest';
import { isSafeProxyPath as studentSafe } from '../../../frontend/src/lib/api/proxyPath';
import {
  forwardedHeaders as adminHeaders,
  upstreamPath as adminPath,
  unreachableBackendLogLine as adminLogLine,
} from '../../../frontend/admin/lib/api/proxyRequest';
import { isSafeProxyPath as adminSafe } from '../../../frontend/admin/lib/api/proxyPath';

/**
 * The two Next proxies (student app and administrator portal) share their
 * request rules as a small module each. The frontends have no test runner of
 * their own, so the rules are pinned here, where the repository's tests run.
 */
const SOURCES = [
  [
    '../../../frontend/src/lib/api/proxyRequest.ts',
    '../../../frontend/admin/lib/api/proxyRequest.ts',
  ],
  [
    '../../../frontend/src/lib/api/proxyPath.ts',
    '../../../frontend/admin/lib/api/proxyPath.ts',
  ],
];

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

  it('does not pass on conditional request headers, which could get a 304 with no body', () => {
    const sent = forwardedHeaders(
      new Headers({
        'If-None-Match': '"abc"',
        'If-Modified-Since': 'Wed, 21 Oct 2026 07:28:00 GMT',
        'If-Match': '"abc"',
        'If-Unmodified-Since': 'Wed, 21 Oct 2026 07:28:00 GMT',
        'If-Range': '"abc"',
      }),
    );

    expect([...sent.keys()]).toEqual([]);
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
      expect(source).toContain("{ 'x-correlation-id': proxyId }");
    });

    it('logs the path without the query string', () => {
      expect(source).toContain("path: `/${path.join('/')}`");
    });
  },
);

describe.each([
  ['student app', studentPath, studentSafe],
  ['administrator portal', adminPath, adminSafe],
])('the %s proxy path', (_app, upstreamPath, isSafeProxyPath) => {
  /** The URL the proxy would ask the API for, as the fetch will read it. */
  const requested = (segments: string[]) =>
    new URL(`http://api.test/${upstreamPath(segments)}?x=1`);

  it('leaves an ordinary path as it was', () => {
    expect(upstreamPath(['support', 'threads', '12', 'messages'])).toBe(
      'support/threads/12/messages',
    );
  });

  it('encodes a # so it cannot cut the path short', () => {
    const url = requested(['admin', 'users', '7#9', 'status']);

    expect(url.hash).toBe('');
    expect(url.pathname).toBe('/admin/users/7%239/status');
    expect(url.search).toBe('?x=1');
  });

  it('encodes a ? so it cannot start a query of its own', () => {
    const url = requested(['admin', 'users', '7?role=ccae_admin']);

    expect(url.pathname).toBe('/admin/users/7%3Frole%3Dccae_admin');
    expect(url.searchParams.get('role')).toBeNull();
    expect(url.searchParams.get('x')).toBe('1');
  });

  it('keeps a segment one segment, however many separators it holds', () => {
    expect(requested(['a b', 'c%2Fd']).pathname).toBe('/a%20b/c%252Fd');
  });

  it('refuses the segments that encoding cannot make safe', () => {
    for (const unsafe of [['..'], ['a', '.'], ['a/b'], ['a\\b'], ['a\0b']]) {
      expect(isSafeProxyPath(unsafe)).toBe(false);
    }
    expect(isSafeProxyPath(['admin', 'users', '7#9', 'x?y'])).toBe(true);
  });

  it('sends a segment with a literal % as it is, encoded once', () => {
    expect(isSafeProxyPath(['support', 'threads', '50%'])).toBe(true);
    expect(upstreamPath(['support', 'threads', '50%'])).toBe(
      'support/threads/50%25',
    );
    expect(requested(['support', 'threads', '50%']).pathname).toBe(
      '/support/threads/50%25',
    );
  });

  it('does not decode a segment Next has already decoded', () => {
    // Each of these is what the API should receive as one literal segment.
    // Decoding them again would turn the first into a slash and the second
    // into a dot segment, or reject them for not being valid encoding.
    for (const decoded of ['a%2Fb', '%2e%2e', '100%', '%zz', '%25']) {
      expect(isSafeProxyPath([decoded])).toBe(true);
      expect(decodeURIComponent(requested([decoded]).pathname.slice(1))).toBe(
        decoded,
      );
    }
    expect(requested(['%2e%2e', 'admin']).pathname).toBe('/%252e%252e/admin');
  });
});

it.each(SOURCES)(
  'keeps the two proxies’ shared rules identical (%s)',
  (studentFile, adminFile) => {
    const [student, admin] = [studentFile, adminFile].map((path) =>
      readFileSync(join(__dirname, path), 'utf8'),
    );

    expect(admin).toBe(student);
  },
);
