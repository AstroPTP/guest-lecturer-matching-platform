/**
 * Settings for the message retention job, read from the environment.
 *
 * Read at the moment of use rather than once at start-up, so a value written
 * into backend/.env by loadEnvFile() is seen and tests can change it between
 * cases without reloading the module.
 *
 * Every value is forgiving on purpose. A typo in an optional setting should
 * fall back to the safe default and say so in the log, not stop the API from
 * booting. The one setting that can do real harm, the retention window, has a
 * floor so a mistyped `3` cannot quietly delete a year of conversations.
 */

export const DEFAULT_RETENTION_DAYS = 365;
export const DEFAULT_BATCH_SIZE = 5000;

/** Shortest window the job will honour, whatever the environment says. */
export const MIN_RETENTION_DAYS = 30;

/** Longest window, a hundred years. Keeps the cut-off a valid date. */
export const MAX_RETENTION_DAYS = 36_500;

/** Largest batch the job will honour, to keep each transaction short. */
export const MAX_BATCH_SIZE = 50_000;

export interface RetentionConfig {
  /** False switches the job off entirely, scheduled or run by hand. */
  enabled: boolean;
  /**
   * False stops this process running the job on its own schedule, for hosts
   * where an external scheduler runs `npm run retention:run` instead. It does
   * not stop that command, and does not disable the job.
   */
  inProcessSchedule: boolean;
  /** True counts what would be deleted and deletes nothing. */
  dryRun: boolean;
  retentionDays: number;
  batchSize: number;
}

type Warn = (message: string) => void;

function readBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
  warn: Warn,
): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  warn(`${name} must be "true" or "false"; using ${String(fallback)}.`);
  return fallback;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  warn: Warn,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  // Number('') is 0 and Number('12abc') is NaN, so accept digits only rather
  // than let a half-valid value through.
  if (!/^\d+$/.test(raw)) {
    warn(`${name} must be a whole number; using ${fallback}.`);
    return fallback;
  }
  return Number(raw);
}

export function readRetentionConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: Warn = () => undefined,
): RetentionConfig {
  let retentionDays = readInteger(
    env,
    'RETENTION_DAYS_MESSAGE_LOG',
    DEFAULT_RETENTION_DAYS,
    warn,
  );
  if (retentionDays < MIN_RETENTION_DAYS) {
    warn(
      `RETENTION_DAYS_MESSAGE_LOG of ${retentionDays} is below the minimum; using ${MIN_RETENTION_DAYS}.`,
    );
    retentionDays = MIN_RETENTION_DAYS;
  } else if (retentionDays > MAX_RETENTION_DAYS) {
    warn(
      `RETENTION_DAYS_MESSAGE_LOG of ${retentionDays} is above the maximum; using ${MAX_RETENTION_DAYS}.`,
    );
    retentionDays = MAX_RETENTION_DAYS;
  }

  let batchSize = readInteger(
    env,
    'RETENTION_BATCH_SIZE',
    DEFAULT_BATCH_SIZE,
    warn,
  );
  if (batchSize < 1) {
    warn(
      `RETENTION_BATCH_SIZE must be at least 1; using ${DEFAULT_BATCH_SIZE}.`,
    );
    batchSize = DEFAULT_BATCH_SIZE;
  } else if (batchSize > MAX_BATCH_SIZE) {
    warn(
      `RETENTION_BATCH_SIZE of ${batchSize} is above the maximum; using ${MAX_BATCH_SIZE}.`,
    );
    batchSize = MAX_BATCH_SIZE;
  }

  return {
    enabled: readBoolean(env, 'RETENTION_ENABLED', true, warn),
    inProcessSchedule: readBoolean(
      env,
      'RETENTION_IN_PROCESS_SCHEDULE',
      true,
      warn,
    ),
    dryRun: readBoolean(env, 'RETENTION_DRY_RUN', false, warn),
    retentionDays,
    batchSize,
  };
}
