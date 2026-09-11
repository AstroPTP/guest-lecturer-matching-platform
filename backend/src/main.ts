import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // An explicit allowlist, never a wildcard and never `origin: true`. The
  // origins come from validateEnv(), which rejects "*", a trailing slash and a
  // path, so a malformed value stops the process at boot rather than quietly
  // widening what the browser will trust.
  //
  // There is deliberately no fallback. The previous `?? 'http://localhost:3000'`
  // meant an unset FRONTEND_URL silently trusted localhost, which is harmless
  // locally and a hole anywhere else.
  //
  // Browser traffic reaches the API through the frontend's same-origin proxy,
  // so this is defence in depth for anything calling the backend directly.
  app.enableCors({
    origin: env.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Every error leaves through here, so nothing reaches a client except the
  // four-field error envelope. Stack traces stay server-side.
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(env.port);
}
void bootstrap();
