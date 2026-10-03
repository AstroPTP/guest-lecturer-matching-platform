import { Module } from '@nestjs/common';
import { DismissalsController } from './dismissals.controller';
import { DismissalsService } from './dismissals.service';

@Module({
  controllers: [DismissalsController],
  providers: [DismissalsService],
})
export class DismissalsModule {}
