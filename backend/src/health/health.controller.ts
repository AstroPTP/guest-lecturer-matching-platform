import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { withTimeout } from '../common/with-timeout';
import { prisma } from '../prisma';

/** A database that cannot answer SELECT 1 in this long is not ready. */
const READINESS_TIMEOUT_MS = 2000;

const DEFAULT_READINESS_CACHE_MS = 2000;

/**
 * Longest an answer may be reused. Past this a cached "ready" could outlive an
 * outage by long enough to matter, so a larger value is treated as a mistake.
 */
const MAX_READINESS_CACHE_MS = 60_000;

/**
 * How long a readiness answer is reused, from READINESS_CACHE_MS. Read on each
 * use so a change on the host applies without a restart. Unset, non-numeric,
 * negative or over the maximum falls back to the default; 0 is allowed and
 * means every probe after the first in flight asks again.
 */
function readinessCacheMs(): number {
  const raw = process.env.READINESS_CACHE_MS?.trim();
  if (!raw) return DEFAULT_READINESS_CACHE_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_READINESS_CACHE_MS
    ? parsed
    : DEFAULT_READINESS_CACHE_MS;
}

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
  /** The last readiness answer and when it stops being reused. */
  private answer?: { ready: boolean; validUntil: number };

  /** The check running now, shared by every probe that arrives meanwhile. */
  private inFlight?: Promise<boolean>;

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
    const ready = await this.isReady();
    response
      .status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({ status: ready ? 'ready' : 'unavailable' });
  }

  /**
   * One database query per window, however many probes arrive.
   *
   * The route is public and exempt from the rate limiter, because a load
   * balancer must never be told to back off. That leaves nothing between a
   * flood of requests and the database, so the work is bounded here instead:
   * the answer, good or bad, is reused for READINESS_CACHE_MS, and probes that
   * arrive while a check is running wait for that one rather than starting
   * their own. A failure is held for the same window, so an outage is not
   * hammered with retries, and then asked again.
   */
  private isReady(): Promise<boolean> {
    if (this.answer && Date.now() < this.answer.validUntil) {
      return Promise.resolve(this.answer.ready);
    }

    // Set before the first await, so a probe arriving in the same tick finds it.
    this.inFlight ??= this.checkDatabase().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async checkDatabase(): Promise<boolean> {
    let ready: boolean;
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS);
      ready = true;
    } catch {
      ready = false;
    }
    // The window runs from when the answer arrived, not from when it was asked
    // for, so a slow check is not reused for less time than a fast one.
    this.answer = { ready, validUntil: Date.now() + readinessCacheMs() };
    return ready;
  }
}
