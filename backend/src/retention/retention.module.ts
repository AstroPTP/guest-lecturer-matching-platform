import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

/**
 * The weekly message purge. The scheduler itself is registered once, in
 * AppModule.
 */
@Module({
  providers: [RetentionService],
})
export class RetentionModule {}
