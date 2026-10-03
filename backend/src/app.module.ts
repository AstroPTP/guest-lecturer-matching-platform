import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AdminModule } from './admin/admin.module';
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
import { SettingsModule } from './settings/settings.module';
import { DismissalsModule } from './dismissals/dismissals.module';

@Module({
  imports: [
    AdminModule,
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
    SettingsModule,
    DismissalsModule,
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
