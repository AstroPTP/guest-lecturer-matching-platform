import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { loadEnvFile } from '../config/load-env';
import { prisma } from '../prisma';
import { RetentionModule } from './retention.module';
import { RetentionService } from './retention.service';

/**
 * Runs the message retention job once and exits, for hosts with no
 * long-running process. An in-process @Cron never fires on serverless hosting,
 * so any scheduler (OS cron, a systemd timer, a Kubernetes CronJob, a platform
 * scheduler) runs `npm run retention:run` weekly instead.
 *
 * It starts an application context rather than the HTTP server, with only
 * RetentionModule: no controllers listening, no auth, and no ScheduleModule,
 * so nothing here can start a second schedule. The purge is the same method
 * the schedule calls, so the lock, the dry-run switch and the single audit row
 * behave identically.
 *
 * Exit code: 0 when the run completed, was skipped because another instance
 * holds the lock, or the job is switched off. 1 when it failed, so the
 * scheduler can alert on it.
 */
export async function runRetentionOnce(): Promise<number> {
  const logger = new Logger('RetentionRun');
  // Read backend/.env first, as main.ts does. Real environment variables win.
  loadEnvFile();

  let exitCode = 1;
  try {
    const app = await NestFactory.createApplicationContext(RetentionModule);
    try {
      // The service logs the one-line summary of counts when the run ends.
      const run = await app.get(RetentionService).runIfEnabled();
      exitCode = run?.outcome === 'failed' ? 1 : 0;
    } finally {
      await app.close();
    }
  } catch (error) {
    // Name only: a start-up error can quote the connection string.
    logger.error(
      `Retention run could not start: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
  } finally {
    // The connection pool keeps the process alive after the work is done.
    await prisma.$disconnect().catch(() => undefined);
  }
  return exitCode;
}

if (require.main === module) {
  void runRetentionOnce().then((code) => process.exit(code));
}
