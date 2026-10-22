import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_RETENTION_DAYS,
  MAX_BATCH_SIZE,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  readRetentionConfig,
} from './retention.config';

const read = (env: Record<string, string>) => {
  const warnings: string[] = [];
  const config = readRetentionConfig(env, (message) => warnings.push(message));
  return { config, warnings };
};

describe('readRetentionConfig', () => {
  it('uses the safe defaults when nothing is set', () => {
    const { config, warnings } = read({});

    expect(config).toEqual({
      enabled: true,
      inProcessSchedule: true,
      dryRun: false,
      retentionDays: DEFAULT_RETENTION_DAYS,
      batchSize: DEFAULT_BATCH_SIZE,
    });
    expect(DEFAULT_RETENTION_DAYS).toBe(365);
    expect(DEFAULT_BATCH_SIZE).toBe(5000);
    expect(warnings).toEqual([]);
  });

  it('reads valid values, ignoring case and surrounding spaces', () => {
    const { config, warnings } = read({
      RETENTION_ENABLED: ' FALSE ',
      RETENTION_IN_PROCESS_SCHEDULE: 'False',
      RETENTION_DRY_RUN: 'True',
      RETENTION_DAYS_MESSAGE_LOG: '90',
      RETENTION_BATCH_SIZE: '250',
    });

    expect(config).toEqual({
      enabled: false,
      inProcessSchedule: false,
      dryRun: true,
      retentionDays: 90,
      batchSize: 250,
    });
    expect(warnings).toEqual([]);
  });

  it('treats an empty value as unset', () => {
    const { config, warnings } = read({
      RETENTION_ENABLED: '',
      RETENTION_DAYS_MESSAGE_LOG: '  ',
    });

    expect(config.enabled).toBe(true);
    expect(config.retentionDays).toBe(365);
    expect(warnings).toEqual([]);
  });

  it.each(['yes', '1', 'on', 'nope'])(
    'falls back to the default for the unrecognised flag %p and says so',
    (value) => {
      const { config, warnings } = read({
        RETENTION_ENABLED: value,
        RETENTION_DRY_RUN: value,
        RETENTION_IN_PROCESS_SCHEDULE: value,
      });

      expect(config.enabled).toBe(true);
      expect(config.dryRun).toBe(false);
      expect(config.inProcessSchedule).toBe(true);
      expect(warnings).toHaveLength(3);
    },
  );

  it.each(['abc', '12abc', '-5', '1.5', '1e3'])(
    'falls back to the defaults for the non-numeric value %p and says so',
    (value) => {
      const { config, warnings } = read({
        RETENTION_DAYS_MESSAGE_LOG: value,
        RETENTION_BATCH_SIZE: value,
      });

      expect(config.retentionDays).toBe(365);
      expect(config.batchSize).toBe(5000);
      expect(warnings).toHaveLength(2);
    },
  );

  it.each(['0', '1', '7', '29'])(
    'clamps %p days up to the minimum, with a warning',
    (value) => {
      const { config, warnings } = read({ RETENTION_DAYS_MESSAGE_LOG: value });

      expect(config.retentionDays).toBe(MIN_RETENTION_DAYS);
      expect(MIN_RETENTION_DAYS).toBe(30);
      expect(warnings).toHaveLength(1);
    },
  );

  it('accepts exactly the minimum without a warning', () => {
    const { config, warnings } = read({ RETENTION_DAYS_MESSAGE_LOG: '30' });

    expect(config.retentionDays).toBe(30);
    expect(warnings).toEqual([]);
  });

  it('clamps an absurdly long window so the cut-off stays a real date', () => {
    const { config, warnings } = read({
      RETENTION_DAYS_MESSAGE_LOG: '99999999999999',
    });

    expect(config.retentionDays).toBe(MAX_RETENTION_DAYS);
    expect(warnings).toHaveLength(1);
  });

  it('rejects a zero batch size and caps an oversized one', () => {
    const zero = read({ RETENTION_BATCH_SIZE: '0' });
    expect(zero.config.batchSize).toBe(DEFAULT_BATCH_SIZE);
    expect(zero.warnings).toHaveLength(1);

    const huge = read({ RETENTION_BATCH_SIZE: '9999999' });
    expect(huge.config.batchSize).toBe(MAX_BATCH_SIZE);
    expect(huge.warnings).toHaveLength(1);
  });

  it('reads process.env by default', () => {
    const before = process.env.RETENTION_DAYS_MESSAGE_LOG;
    process.env.RETENTION_DAYS_MESSAGE_LOG = '45';
    try {
      expect(readRetentionConfig().retentionDays).toBe(45);
    } finally {
      if (before === undefined) delete process.env.RETENTION_DAYS_MESSAGE_LOG;
      else process.env.RETENTION_DAYS_MESSAGE_LOG = before;
    }
  });
});
