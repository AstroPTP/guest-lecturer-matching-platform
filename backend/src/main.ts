import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validateEnv } from './config/env.validation';
import { loadEnvFile } from './config/load-env';

async function bootstrap() {
  // Read backend/.env first. Nothing else in the process does this, so without
  // it validateEnv() sees an empty environment and stops the boot even when the
  // file is correctly filled in. Real environment variables still take
  // precedence over the file.
  loadEnvFile();

  // Before Nest builds anything. A configuration fault should stop the process
  // here, with a message naming the variable, rather than surfacing later as a
  // guard that rejects every request for no visible reason.
  const env = validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The existing helmet() call, now with the two things its defaults leave open
  // for us. Everything else it already sets, nosniff, no X-Powered-By and the
  // referrer policy, is correct and untouched.
  app.use(
    helmet({
      // HDR-02. helmet's default is X-Frame-Options: SAMEORIGIN, but nothing in
      // this application is meant to be framed, including by itself.
      frameguard: { action: 'deny' },

      // HDR-03. Only meaningful over https, so it does nothing locally, but it
      // has to be configured before deployment rather than after.
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false,
      },

      // HDR-04. helmet's default policy is already restrictive. Stating the
      // directives that matter means a future major version cannot loosen them
      // under us.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The API serves JSON. It has no scripts, styles or frames of its
          // own, so everything it does not need is denied outright.
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Express does not trust proxy headers by default, and that default is
  // correct: with it off, a spoofed X-Forwarded-For cannot reset anyone's
  // rate-limit counter.
  //
  // The flip side is that once the app sits behind a load balancer, every
  // request appears to come from the balancer, so all users share one bucket
  // and everyone is limited almost immediately.
  //
  // The fix is a hop COUNT, never `true`. Setting `true` tells Express to
  // believe the whole X-Forwarded-For chain, which hands the bypass straight
  // back to the client. TRUST_PROXY_HOPS is the number of proxies actually in
  // front of us, and unset means none, which is correct for local development.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }

  // Every error leaves through here, so nothing reaches a client except the
  // four-field error envelope. Stack traces stay server-side.
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(env.port);
}
void bootstrap();
