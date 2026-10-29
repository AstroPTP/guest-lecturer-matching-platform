import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MatchRequestsModule } from '../match-requests/match-requests.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MatchRequestsModule, NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
