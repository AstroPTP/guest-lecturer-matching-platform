import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
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
