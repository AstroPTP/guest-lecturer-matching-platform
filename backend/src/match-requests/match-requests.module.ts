import { Module } from '@nestjs/common';
import { MatchRequestsController } from './match-requests.controller';
import { MatchRequestsService } from './match-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MatchRequestsController],
  providers: [MatchRequestsService],
  exports: [MatchRequestsService],
})
export class MatchRequestsModule {}
