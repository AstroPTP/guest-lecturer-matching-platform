import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsOptions } from './common/cors-options';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { requestContextMiddleware } from './common/request-context.middleware';
import { validateEnv } from './config/env.validation';
import { loadEnvFile } from './config/load-env';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

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

  // First, so that everything after it, including a CORS preflight and a body
  // refused for its size, has a correlation id and ends up in the request log.
  app.use(requestContextMiddleware());

  app.use(
    helmet({
      frameguard: { action: 'deny' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
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

  app.enableCors(corsOptions(env.allowedOrigins));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }

  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(env.port);
}
void bootstrap();
