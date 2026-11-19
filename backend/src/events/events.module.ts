import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchRequestsModule } from '../match-requests/match-requests.module';

@Module({
  imports: [NotificationsModule, MatchRequestsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
