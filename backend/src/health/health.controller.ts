import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
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
 *
 * Both skip the rate limiter too. A host probes on a fixed beat from one
 * address, and a limiter that answers 429 to the probe would take a healthy
 * instance out of rotation. Each does almost no work, so there is little to
 * protect: liveness does none and readiness is a single SELECT 1.
 */
@Controller()
export class HealthController {
  /**
   * Liveness: the process is up and answering HTTP. Touches nothing else, so a
   * database outage cannot make the host restart a healthy process.
   */
  @Public()
  @SkipThrottle()
  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness: the process can reach its database. A failing answer tells the
   * host to stop sending traffic, not to restart.
   *
   * Answers on the response directly instead of throwing. A thrown exception
   * goes through GlobalExceptionFilter, which would log every failed probe at
   * error level with a stack trace, count it as a server error against the
   * administrator's error rate, and replace this body with the standard error
   * envelope. A probe every few seconds during an outage would then bury the
   * log and trip the error-rate warning on its own.
   *
   * The reason for a failure is deliberately dropped. The driver's message can
   * name the database host and port, so it is not safe to return and is not
   * needed by a probe.
   */
  @Public()
  @SkipThrottle()
  @Get('readyz')
  async readiness(@Res() response: Response): Promise<void> {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS);
    } catch {
      response
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json({ status: 'unavailable' });
      return;
    }
    response.status(HttpStatus.OK).json({ status: 'ready' });
  }
}
