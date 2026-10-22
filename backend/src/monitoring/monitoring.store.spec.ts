import { categorise, MonitoringStore } from './monitoring.store';

const minutesAgo = (minutes: number, from = new Date()) =>
  new Date(from.getTime() - minutes * 60_000);

describe('categorise', () => {
  it.each([
    [500, '/users', 'server_error'],
    [502, '/admin/system', 'server_error'],
    [503, '/readyz', 'server_error'],
    [401, '/users/me', 'auth_failure'],
    [401, '/admin/users', 'auth_failure'],
    [403, '/admin/users', 'admin_forbidden'],
    [403, '/admin', 'admin_forbidden'],
    [403, '/ADMIN/users', 'admin_forbidden'],
    [429, '/auth/login', 'rate_limited'],
  ])('puts %i on %s in %s', (status, path, expected) => {
    expect(categorise(status, path)).toBe(expected);
  });

  it.each([
    [403, '/users'],
    [403, '/match-requests/4'],
    [403, '/administrators'],
    [403, '/ccae-administrators'],
    [400, '/admin/users'],
    [404, '/admin/users'],
    [409, '/match-requests'],
    [413, '/messages'],
    [200, '/admin/users'],
  ])('does not record %i on %s', (status, path) => {
    expect(categorise(status, path)).toBeUndefined();
  });
});

describe('MonitoringStore', () => {
  it('records the four categories and ignores everything else', () => {
    const store = new MonitoringStore();

    store.record({ status: 500, method: 'GET', path: '/a' });
    store.record({ status: 401, method: 'GET', path: '/b' });
    store.record({ status: 403, method: 'GET', path: '/admin/c' });
    store.record({ status: 429, method: 'POST', path: '/auth/d' });
    store.record({ status: 403, method: 'GET', path: '/users' });
    store.record({ status: 404, method: 'GET', path: '/e' });

    const expected = {
      authFailures: 1,
      adminForbidden: 1,
      rateLimited: 1,
      serverErrors: 1,
    };
    expect(store.countsSince(minutesAgo(1))).toEqual(expected);
    expect(store.countsSinceStart()).toEqual(expected);
    expect(store.recent(10)).toHaveLength(4);
  });

  it('strips the query string and fragment from the path', () => {
    const store = new MonitoringStore();

    store.record({
      status: 401,
      method: 'GET',
      path: '/users/me?access_token=secret-token&email=a@b.example#frag',
    });

    const [event] = store.recent(1);
    expect(event.path).toBe('/users/me');
    expect(JSON.stringify(event)).not.toMatch(/secret-token|a@b\.example|frag/);
  });

  it('keeps only the six agreed fields', () => {
    const store = new MonitoringStore();

    store.record({
      status: 500,
      method: 'post',
      path: '/x',
      userId: 7,
      // Anything extra the caller passes must not be stored.
      ...({
        body: { password: 'p' },
        headers: { authorization: 'Bearer t' },
      } as object),
    });

    const [event] = store.recent(1);
    expect(Object.keys(event).sort()).toEqual([
      'at',
      'category',
      'method',
      'path',
      'status',
      'userId',
    ]);
    expect(event.method).toBe('POST');
    expect(event.at).toBeInstanceOf(Date);
  });

  it('keeps a numeric user id and drops anything else', () => {
    const store = new MonitoringStore();

    store.record({ status: 500, method: 'GET', path: '/a', userId: 42 });
    store.record({ status: 500, method: 'GET', path: '/b', userId: null });
    store.record({ status: 500, method: 'GET', path: '/c' });
    store.record({
      status: 500,
      method: 'GET',
      path: '/d',
      userId: 'auth0|abc' as unknown as number,
    });
    store.record({ status: 500, method: 'GET', path: '/e', userId: NaN });

    const byPath = Object.fromEntries(
      store.recent(10).map((e) => [e.path, e.userId]),
    );
    expect(byPath).toEqual({
      '/a': 42,
      '/b': null,
      '/c': null,
      '/d': null,
      '/e': null,
    });
  });

  it('bounds the path length so one request cannot fill memory', () => {
    const store = new MonitoringStore();

    store.record({ status: 500, method: 'GET', path: `/${'a'.repeat(5000)}` });

    expect(store.recent(1)[0].path.length).toBeLessThanOrEqual(200);
  });

  it('is bounded: the oldest entries fall off once the buffer is full', () => {
    const store = new MonitoringStore(3);

    for (let i = 1; i <= 5; i += 1) {
      store.record({ status: 500, method: 'GET', path: `/p${i}` });
    }

    expect(store.recent(10).map((e) => e.path)).toEqual(['/p5', '/p4', '/p3']);
    // The since-start counters are not bounded by the buffer.
    expect(store.countsSinceStart().serverErrors).toBe(5);
    // The window count can only see what the buffer still holds.
    expect(store.countsSince(minutesAgo(60)).serverErrors).toBe(3);
  });

  it('holds 2000 entries by default and no more', () => {
    const store = new MonitoringStore();

    for (let i = 0; i < 2500; i += 1) {
      store.record({ status: 500, method: 'GET', path: `/p${i}` });
    }

    expect(store.recent(5000)).toHaveLength(2000);
    expect(store.recent(1)[0].path).toBe('/p2499');
    expect(store.countsSinceStart().serverErrors).toBe(2500);
  });

  it('counts only events inside the window', () => {
    const store = new MonitoringStore();
    const now = new Date();

    store.record({
      status: 401,
      method: 'GET',
      path: '/a',
      at: minutesAgo(30, now),
    });
    store.record({
      status: 401,
      method: 'GET',
      path: '/b',
      at: minutesAgo(14, now),
    });
    store.record({
      status: 401,
      method: 'GET',
      path: '/c',
      at: minutesAgo(1, now),
    });
    store.record({
      status: 429,
      method: 'GET',
      path: '/d',
      at: minutesAgo(20, now),
    });

    expect(store.countsSince(minutesAgo(15, now))).toEqual({
      authFailures: 2,
      adminForbidden: 0,
      rateLimited: 0,
      serverErrors: 0,
    });
    expect(store.countsSinceStart()).toMatchObject({
      authFailures: 3,
      rateLimited: 1,
    });
  });

  it('returns the newest events first and honours the limit', () => {
    const store = new MonitoringStore();
    for (let i = 1; i <= 5; i += 1) {
      store.record({ status: 500, method: 'GET', path: `/p${i}` });
    }

    expect(store.recent(2).map((e) => e.path)).toEqual(['/p5', '/p4']);
    expect(store.recent(0)).toEqual([]);
    expect(store.recent(-3)).toEqual([]);
    expect(store.recent(NaN)).toEqual([]);
  });

  it('hands out copies of the totals, not its own counters', () => {
    const store = new MonitoringStore();
    store.record({ status: 500, method: 'GET', path: '/a' });

    store.countsSinceStart().serverErrors = 99;

    expect(store.countsSinceStart().serverErrors).toBe(1);
  });

  it('records when it started, and empties on reset', () => {
    const store = new MonitoringStore();
    store.record({ status: 500, method: 'GET', path: '/a' });

    expect(store.startedAt).toBeInstanceOf(Date);

    store.reset();

    expect(store.recent(10)).toEqual([]);
    expect(store.countsSinceStart().serverErrors).toBe(0);
  });
});
