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
  /**
   * Creates a match request and returns the stored row.
   *
   * The row comes back from the database rather than from memory, so the id is
   * the one the database assigned and a later read finds the same record. That
   * is the difference between this and what was here before, which returned an
   * object that existed only until the process restarted.
   */
  async create(createMatchRequestDto: CreateMatchRequestDto) {
    const now = new Date();
    return this.createNewMatchRequestInDatabase({
      matchId: '',
      status: 'PENDING',
      requestedAt: now,
      updatedAt: now,
      ...createMatchRequestDto,
    });
  }

  /** Every match request, from the database. */
  async findAll() {
    return prisma.match_requests.findMany({
      orderBy: { requested_at: 'desc' },
    });
  }

  private async createNewMatchRequestInDatabase(dto: MatchRequest) {
    return prisma.match_requests.create({
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
