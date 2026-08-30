import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
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

  await app.listen(env.port);
}
void bootstrap();
