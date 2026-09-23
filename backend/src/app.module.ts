import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AppService } from './app.service';
import { CcaeAdministratorsModule } from './ccae-administrators/ccae-administrators.module';
import { GuestSpeakersModule } from './guest-speakers/guest-speakers.module';
import { MatchRequestsModule } from './match-requests/match-requests.module';
import { MessagesModule } from './messages/messages.module';
import { UnitCoordinatorsModule } from './unit-coordinators/unit-coordinators.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    CcaeAdministratorsModule,
    GuestSpeakersModule,
    MatchRequestsModule,
    MessagesModule,
    UnitCoordinatorsModule,
    UsersModule,
    EventsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
