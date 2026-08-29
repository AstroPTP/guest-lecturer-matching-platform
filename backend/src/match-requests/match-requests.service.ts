import { Injectable } from '@nestjs/common';
import { CreateMatchRequestDto } from './dto/create-match-request.dto';

export interface MatchRequest extends CreateMatchRequestDto {
  matchId: string;
  status: string;
  requestedAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MatchRequestsService {
  private matchRequests: MatchRequest[] = [];

  create(createMatchRequestDto: CreateMatchRequestDto) {
    const now = new Date();
    const newMatchRequest: MatchRequest = {
      matchId: crypto.randomUUID(),
      status: 'PENDING',
      requestedAt: now,
      updatedAt: now,
      ...createMatchRequestDto,
    };
    this.matchRequests.push(newMatchRequest);
    return newMatchRequest;
  }

  findAll() {
    return this.matchRequests;
  }
}