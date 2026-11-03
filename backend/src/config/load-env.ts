/**
 * Loads backend/.env into process.env before anything reads it.
 *
 * This exists because of a defect found in review: the
 * validation in env.validation.ts assumed something had already populated
 * process.env, and nothing had. `nest start` does not read a .env file, and
 * neither does `node dist/src/main`. Only prisma.config.ts did, through its own
 * `import 'dotenv/config'`, which is why Prisma worked against a filled-in
 * .env while the application reported all six variables unset and refused to
 * boot at all.
 *
 * Four choices worth recording, because each had an obvious-looking
 * alternative:
 *
 * 1. Node's own parser rather than dotenv. `util.parseEnv` is the same parser
 *    that backs `--env-file`, built in from Node 20.12, and .nvmrc pins 22.13.
 *    dotenv is currently in the lockfile only as a transitive dependency of
 *    @prisma/config. Using it here would mean declaring a new runtime
 *    dependency to do something the runtime already does.
 *
 * 2. Parse and assign here rather than calling `process.loadEnvFile`. That
 *    function writes to the real process environment through a native binding,
 *    which the Jest sandbox does not see, so the behaviour below could not be
 *    tested. Doing the assignment in JavaScript also puts the precedence rule
 *    in code where it can be read, instead of leaving it implied.
 *
 * 3. Called from the boot path rather than added to the npm scripts as
 *    `--env-file`. `nest start` compiles and then spawns a separate process,
 *    `start:prod` runs a different entry point again, and the e2e suite runs
 *    neither. One call at the top of bootstrap() covers every one of them, and
 *    a new script cannot forget the flag.
 *
 * 4. A missing file is not an error. CI has no .env and the deployed
 *    environment will not have one either; both set real environment
 *    variables. If the values genuinely are not set anywhere, validateEnv()
 *    still stops the process a moment later and names every one of them,
 *    that behaviour is the point and it is unchanged.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Reads `.env` from `directory` into process.env and returns the path it
 * loaded, or null if there was no file to load.
 *
 * Variables already present in the real environment win. A value exported in
 * the shell, set by CI or injected by the host must not be silently
 * replaced by a stale line in a developer's local file.
 */
export function loadEnvFile(directory: string = process.cwd()): string | null {
  const path = resolve(directory, '.env');

  if (!existsSync(path)) {
    return null;
  }

  const parsed = parseEnv(readFileSync(path, 'utf8'));

  for (const [name, value] of Object.entries(parsed)) {
    if (value !== undefined && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }

  return path;
}
