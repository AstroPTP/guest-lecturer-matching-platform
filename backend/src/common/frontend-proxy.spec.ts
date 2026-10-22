import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forwardedHeaders as studentHeaders } from '../../../frontend/src/lib/api/proxyRequest';
import { forwardedHeaders as adminHeaders } from '../../../frontend/admin/lib/api/proxyRequest';

/**
 * The two Next proxies (student app and administrator portal) share their
 * request rules as a small module each. The frontends have no test runner of
 * their own, so the rules are pinned here, where the repository's tests run.
 */
const SOURCES = {
  'student app': '../../../frontend/src/lib/api/proxyRequest.ts',
  'administrator portal': '../../../frontend/admin/lib/api/proxyRequest.ts',
};

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

it('keeps the two proxies’ request rules identical', () => {
  const [student, admin] = Object.values(SOURCES).map((path) =>
    readFileSync(join(__dirname, path), 'utf8'),
  );

  expect(admin).toBe(student);
});
