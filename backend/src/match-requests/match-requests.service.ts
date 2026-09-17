import { Injectable } from '@nestjs/common';
import { prisma, toId } from '../prisma';
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

  private async createNewMatchRequestInDatabase(dto: MatchRequest) {
    await prisma.match_requests.create({
      data: {
        coordinator_id: toId(dto.unitId, 'unitId'),
        guest_id: toId(dto.speakerId, 'speakerId'),
        status: dto.status,
        requested_at: dto.requestedAt,
        updated_at: dto.updatedAt,
      },
    });
  }
}
