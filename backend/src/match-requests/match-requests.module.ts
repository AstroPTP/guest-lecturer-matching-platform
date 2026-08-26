import { Module } from '@nestjs/common';
import { MatchRequestsController } from './match-requests.controller';

@Module({
  controllers: [MatchRequestsController]
})
export class MatchRequestsModule {}
