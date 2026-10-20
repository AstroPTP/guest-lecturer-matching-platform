import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

/**
 * The weekly message purge and the administrator's preview of it. The
 * scheduler itself is registered once, in AppModule.
 */
@Module({
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
