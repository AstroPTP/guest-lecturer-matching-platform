import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AppService } from './app.service';
import { CcaeAdministratorsModule } from './ccae-administrators/ccae-administrators.module';
import { GuestSpeakersController } from './guest-speakers/guest-speakers.controller';
import { GuestSpeakersService } from './guest-speakers/guest-speakers.service';
import { GuestSpeakersModule } from './guest-speakers/guest-speakers.module';
import { MatchRequestsModule } from './match-requests/match-requests.module';
import { MessagesModule } from './messages/messages.module';
import { UnitCoordinatorsModule } from './unit-coordinators/unit-coordinators.module';
import { UnitsModule } from './units/units.module';
import { UsersModule } from './users/users.module';

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
    UnitsModule,
    UsersModule,
  ],
  controllers: [AppController, GuestSpeakersController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    GuestSpeakersService,
  ],
})
export class AppModule {}
