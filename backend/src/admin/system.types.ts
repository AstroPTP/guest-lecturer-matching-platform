/**
 * The shapes the administrator's system pages receive. A contract with the
 * frontend: rename a field here and the page that reads it goes blank.
 */

/**
 * `unknown` is a first-class answer, not a gap in the data. It means the figure
 * could not be measured here, and the check says why in its message. Showing a
 * number that was not measured would be worse than showing none.
 */
export type CheckStatus = 'healthy' | 'warning' | 'unavailable' | 'unknown';

export interface SystemCheck {
  key:
    | 'api'
    | 'database'
    | 'database_size'
    | 'disk'
    | 'memory'
    | 'cpu'
    | 'error_rate'
    | 'retention';
  label: string;
  status: CheckStatus;
  value: number | null;
  unit: string | null;
  threshold: { warning: number | null; critical: number | null } | null;
  message: string;
  checkedAt: string;
}

export interface SystemSnapshot {
  checkedAt: string;
  overall: CheckStatus;
  uptimeSeconds: number;
  checks: SystemCheck[];
  storage: {
    databaseBytes: number | null;
    databaseLimitBytes: number | null;
    photosBytes: number | null;
    largestTables: { table: string; rows: number; bytes: number }[];
    disk: { path: string; totalBytes: number; freeBytes: number } | null;
    memory: { totalBytes: number; freeBytes: number; processRssBytes: number };
  };
  usage: {
    activeUsers24h: number | null;
    activeUsers7d: number | null;
    newAccounts7d: number | null;
    matchRequests7d: number | null;
    messages7d: number | null;
    photosStored: number | null;
  };
  alerts: { key: string; status: 'warning' | 'unavailable'; message: string }[];
}

export interface SecuritySignals {
  startedAt: string;
  windowMinutes: number;
  counts: {
    authFailures: number;
    adminForbidden: number;
    rateLimited: number;
    serverErrors: number;
  };
  countsSinceStart: {
    authFailures: number;
    adminForbidden: number;
    rateLimited: number;
    serverErrors: number;
  };
  alerts: { key: string; status: 'warning'; message: string }[];
  recent: {
    at: string;
    category:
      | 'auth_failure'
      | 'admin_forbidden'
      | 'rate_limited'
      | 'server_error';
    method: string;
    path: string;
    status: number;
    userId: number | null;
  }[];
  authProviderNote: string;
}
