import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { withTimeout } from '../common/with-timeout';
import { prisma } from '../prisma';

/** A database that cannot answer SELECT 1 in this long is not ready. */
const READINESS_TIMEOUT_MS = 2000;

/**
 * Probe endpoints for the host and for uptime monitors.
 *
 * Both are @Public(): a load balancer holds no token, and a probe that needs
 * one cannot tell anybody the service is down. That is also why neither says
 * anything beyond one word. No versions, no host names, no error text, because
 * an unauthenticated caller can read every byte of it.
 */
@Controller()
export class HealthController {
  /**
   * Liveness: the process is up and answering HTTP. Touches nothing else, so a
   * database outage cannot make the host restart a healthy process.
   */
  @Public()
  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness: the process can reach its database. A failing answer tells the
   * host to stop sending traffic, not to restart.
   *
   * The reason for a failure is deliberately dropped. The driver's message can
   * name the database host and port, so it is not safe to return and is not
   * needed by a probe.
   */
  @Public()
  @Get('readyz')
  async readiness() {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS);
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ready' };
  }
}
