import { Injectable } from '@nestjs/common';
import { prisma, toId } from '../prisma';
import { CreateMessagesDto } from './dto/create-messages.dto';

export interface Messages extends CreateMessagesDto {
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class MessagesService {
  async create(createMessagesDto: CreateMessagesDto) {
    return this.createNewMessageInDatabase({
      messageId: '',
      sentAt: new Date(),
      ...createMessagesDto,
    });
  }

  async findAll() {
    return prisma.messages.findMany({
      orderBy: { sent_at: 'desc' },
    });
  }

  private async createNewMessageInDatabase(dto: Messages) {
    return prisma.messages.create({
      data: {
        match_id: toId(dto.matchId, 'matchId'),
        content: dto.content,
        sent_at: dto.sentAt,
      },
    });
  }
}
