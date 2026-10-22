import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushController } from './push.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
