import { Module } from '@nestjs/common';
import { GuestSpeakersController } from './guest-speakers.controller';
import { GuestSpeakersService } from './guest-speakers.service';

@Module({
  controllers: [GuestSpeakersController],
  providers: [GuestSpeakersService],
  exports: [GuestSpeakersService],
})
export class GuestSpeakersModule {}
