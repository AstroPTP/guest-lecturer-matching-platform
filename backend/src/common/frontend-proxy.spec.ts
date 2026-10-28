import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  forwardedHeaders as studentHeaders,
  upstreamPath as studentPath,
} from '../../../frontend/src/lib/api/proxyRequest';
import { isSafeProxyPath as studentSafe } from '../../../frontend/src/lib/api/proxyPath';
import {
  forwardedHeaders as adminHeaders,
  upstreamPath as adminPath,
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

describe.each([
  ['student app', studentHeaders],
  ['administrator portal', adminHeaders],
])('the %s proxy request headers', (_app, forwardedHeaders) => {
  it('does not pass on a correlation id the browser chose, whatever its case', () => {
    const sent = forwardedHeaders(
      new Headers({ 'X-Correlation-Id': 'chosen-by-the-browser' }),
    );

    expect(sent.has('x-correlation-id')).toBe(false);
  });

  it('leaves the id for the backend to give, rather than adding one', () => {
    expect(forwardedHeaders(new Headers()).has('x-correlation-id')).toBe(false);
  });

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
