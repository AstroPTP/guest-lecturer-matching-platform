import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { loadEnvFile } from './load-env';

/** A throwaway directory holding a .env, cleaned up after each test. */
function directoryContaining(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'glma-env-'));
  writeFileSync(join(directory, '.env'), contents);
  return directory;
}

describe('loadEnvFile', () => {
  const created: string[] = [];
  const touched = ['GLMA_SPEC_ONE', 'GLMA_SPEC_TWO', 'GLMA_SPEC_PRESET'];

  afterEach(() => {
    for (const name of touched) {
      delete process.env[name];
    }
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads the file into process.env and returns the path it read', () => {
    const directory = directoryContaining(
      'GLMA_SPEC_ONE=first\nGLMA_SPEC_TWO=second\n',
    );
    created.push(directory);

    const loaded = loadEnvFile(directory);

    expect(loaded).toBe(resolve(directory, '.env'));
    expect(process.env.GLMA_SPEC_ONE).toBe('first');
    expect(process.env.GLMA_SPEC_TWO).toBe('second');
  });

  it('returns null rather than throwing when there is no file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'glma-env-'));
    created.push(directory);

    // CI and the deployed host both run without a .env. A missing file is a
    // normal state, not a fault; validateEnv() is what reports genuinely
    // absent configuration.
    expect(loadEnvFile(directory)).toBeNull();
  });

  it('leaves a variable already set in the real environment alone', () => {
    // A value exported in the shell, set by CI or injected by the host
    // must win over a stale line in someone's local file.
    process.env.GLMA_SPEC_PRESET = 'from the environment';
    const directory = directoryContaining('GLMA_SPEC_PRESET=from the file\n');
    created.push(directory);

    loadEnvFile(directory);

    expect(process.env.GLMA_SPEC_PRESET).toBe('from the environment');
  });
});

/**
 * The defect this guards against is an absence, not a wrong value: the boot
 * path simply never loaded the file. No unit test of a function can catch
 * that, because there is no function to call, so this asserts the wiring in
 * main.ts directly. If the call is removed or moved after validateEnv(), the
 * application goes back to refusing to start with a correctly filled-in .env,
 * which is exactly what was reported in review.
 */
describe('the boot path', () => {
  const main = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');

  it('loads the environment file before validating it', () => {
    // Comments mention both names, so match the statements themselves.
    const load = main.indexOf('  loadEnvFile();');
    const validate = main.indexOf('const env = validateEnv();');

    expect(load).toBeGreaterThan(-1);
    expect(validate).toBeGreaterThan(-1);
    expect(load).toBeLessThan(validate);
  });
});
