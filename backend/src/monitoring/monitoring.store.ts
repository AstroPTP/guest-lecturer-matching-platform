/**
 * An in-memory record of the responses an administrator should hear about.
 *
 * A plain singleton rather than an injectable, because the exception filter
 * that feeds it is built with `new` in main.ts and never goes through Nest's
 * container. Anything the filter needs has to be importable by itself.
 *
 * What it keeps is deliberately thin: when, which status, which category, the
 * method, the path without its query string, and a numeric user id when one is
 * known. Never a body, a header, a token or an email. The administrator needs
 * to see that something is happening, not to be handed the material an
 * attacker was sending.
 *
 * Process-local and bounded. A restart empties it and a second instance has
 * its own, so the figures describe this process since it started, which is
 * exactly what the dashboard says they are.
 */

export type SecurityCategory =
  | 'server_error'
  | 'auth_failure'
  | 'admin_forbidden'
  | 'rate_limited';

export interface SecurityEvent {
  at: Date;
  status: number;
  category: SecurityCategory;
  method: string;
  path: string;
  userId: number | null;
}

export interface CategoryCounts {
  authFailures: number;
  adminForbidden: number;
  rateLimited: number;
  serverErrors: number;
}

/** What the filter hands over. The store decides whether it is worth keeping. */
export interface RecordInput {
  status: number;
  method: string;
  path: string;
  userId?: number | null;
  at?: Date;
}

const DEFAULT_CAPACITY = 2000;

/** A path is attacker-controlled text. Bounded so one cannot fill the buffer. */
const MAX_PATH_LENGTH = 200;
const MAX_METHOD_LENGTH = 16;

const emptyCounts = (): CategoryCounts => ({
  authFailures: 0,
  adminForbidden: 0,
  rateLimited: 0,
  serverErrors: 0,
});

/** Strips the query string and fragment. They routinely carry tokens. */
function withoutQuery(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

/**
 * Express matches routes case-insensitively, so /ADMIN/users reaches the admin
 * controller. The test has to ignore case or that spelling would slip past.
 */
function isAdminPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === '/admin' || lower.startsWith('/admin/');
}

/**
 * Maps a response to a category, or undefined when it is not a security
 * signal. A 403 only counts on /admin: elsewhere it is an ordinary "this is
 * not yours", which would drown the figure that matters.
 */
export function categorise(
  status: number,
  path: string,
): SecurityCategory | undefined {
  if (status >= 500) return 'server_error';
  if (status === 401) return 'auth_failure';
  if (status === 403 && isAdminPath(path)) return 'admin_forbidden';
  if (status === 429) return 'rate_limited';
  return undefined;
}

export class MonitoringStore {
  readonly startedAt = new Date();

  private readonly ring: (SecurityEvent | undefined)[];
  /** Index the next event is written to. */
  private next = 0;
  private size = 0;
  private totals = emptyCounts();

  private readonly capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    // A capacity under one would make the wrap-around a modulo by zero.
    this.capacity = Math.max(1, Math.floor(capacity));
    this.ring = new Array<SecurityEvent | undefined>(this.capacity);
  }

  /** Keeps the response if it is a security signal. Returns it, or undefined. */
  record(input: RecordInput): SecurityEvent | undefined {
    const path = withoutQuery(String(input.path ?? '')).slice(
      0,
      MAX_PATH_LENGTH,
    );
    const category = categorise(input.status, path);
    if (!category) return undefined;

    const event: SecurityEvent = {
      at: input.at ?? new Date(),
      status: input.status,
      category,
      method: String(input.method ?? '')
        .toUpperCase()
        .slice(0, MAX_METHOD_LENGTH),
      path,
      userId:
        typeof input.userId === 'number' && Number.isSafeInteger(input.userId)
          ? input.userId
          : null,
    };

    this.ring[this.next] = event;
    this.next = (this.next + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
    this.bump(this.totals, category);

    return event;
  }

  /**
   * Counts within the buffer at or after `since`. The totals below are not
   * bounded by the buffer; this is, so a window reaching further back than the
   * oldest kept event can under-report. At 2000 entries that takes a sustained
   * flood, and the figure is then low rather than wrong in the safe direction.
   */
  countsSince(since: Date): CategoryCounts {
    const counts = emptyCounts();
    const cutoff = since.getTime();
    for (const event of this.events()) {
      if (event.at.getTime() >= cutoff) this.bump(counts, event.category);
    }
    return counts;
  }

  countsSinceStart(): CategoryCounts {
    return { ...this.totals };
  }

  /** The newest events first, at most `limit` of them. */
  recent(limit: number): SecurityEvent[] {
    const wanted = Number.isFinite(limit) ? Math.max(Math.floor(limit), 0) : 0;
    if (wanted === 0) return [];
    return this.events().slice(-wanted).reverse();
  }

  /** Empties the buffer and counters. For tests; the process never calls it. */
  reset(): void {
    this.ring.fill(undefined);
    this.next = 0;
    this.size = 0;
    this.totals = emptyCounts();
  }

  /** Oldest first. */
  private events(): SecurityEvent[] {
    const out: SecurityEvent[] = [];
    const start = this.size < this.capacity ? 0 : this.next;
    for (let i = 0; i < this.size; i += 1) {
      const event = this.ring[(start + i) % this.capacity];
      if (event) out.push(event);
    }
    return out;
  }

  private bump(counts: CategoryCounts, category: SecurityCategory): void {
    switch (category) {
      case 'auth_failure':
        counts.authFailures += 1;
        break;
      case 'admin_forbidden':
        counts.adminForbidden += 1;
        break;
      case 'rate_limited':
        counts.rateLimited += 1;
        break;
      case 'server_error':
        counts.serverErrors += 1;
        break;
    }
  }
}

export const monitoringStore = new MonitoringStore();
