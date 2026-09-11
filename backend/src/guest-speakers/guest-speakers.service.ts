import { Injectable } from '@nestjs/common';
import { CreateGuestSpeakerDto } from './dto/create-guest-speaker.dto';

export interface GuestSpeaker extends CreateGuestSpeakerDto {
  speakerId: string;
}

@Injectable()
export class GuestSpeakersService {
  private speakers: GuestSpeaker[] = [];

  create(createGuestSpeakerDto: CreateGuestSpeakerDto) {
    const newSpeaker: GuestSpeaker = {
      speakerId: crypto.randomUUID(),
      ...createGuestSpeakerDto,
    };
    this.speakers.push(newSpeaker);
    return newSpeaker;
  }

  findAll() {
    return this.speakers;
  }
}