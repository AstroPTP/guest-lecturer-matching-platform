import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validateEnv } from './config/env.validation';
import { loadEnvFile } from './config/load-env';

async function bootstrap() {
  // Read backend/.env first. Nothing else in the process does this — that was
  // the defect raised against pull request #34 — so without it validateEnv()
  // sees an empty environment and stops the boot even when the file is
  // correctly filled in. Real environment variables still take precedence.
  loadEnvFile();

  // Before Nest builds anything. A configuration fault should stop the process
  // here, with a message naming the variable, rather than surfacing later as a
  // guard that rejects every request for no visible reason.
  const env = validateEnv();

  const app = await NestFactory.create(AppModule);
  app.use(helmet());

  // Every error leaves through here, so nothing reaches a client except the
  // four-field SAS 2.5.5 envelope.
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(env.port);
}
void bootstrap();
