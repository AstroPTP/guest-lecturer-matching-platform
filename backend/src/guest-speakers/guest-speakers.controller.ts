import { Controller, Post, Get, Body } from '@nestjs/common';
import { GuestSpeakersService } from './guest-speakers.service';
import { CreateGuestSpeakerDto } from './dto/create-guest-speaker.dto';

@Controller('guest-speakers')
export class GuestSpeakersController {
  constructor(private readonly guestSpeakersService: GuestSpeakersService) {}

  @Post()
  create(@Body() createGuestSpeakerDto: CreateGuestSpeakerDto) {
    return this.guestSpeakersService.create(createGuestSpeakerDto);
  }

  @Get()
  findAll() {
    return this.guestSpeakersService.findAll();
  }
}