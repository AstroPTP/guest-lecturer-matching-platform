import { Injectable } from '@nestjs/common';
import { prisma, toId } from '../prisma';
import { CreateMessagesDto } from './dto/create-messages.dto';

export interface Messages extends CreateMessagesDto {
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class MessagesService {
  private messages: Messages[] = [];

  create(createMessagesDto: CreateMessagesDto) {
    const newMessage: Messages = {
      messageId: crypto.randomUUID(),
      sentAt: new Date(),
      ...createMessagesDto,
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  findAll() {
    return this.messages;
  }

  private async createNewMessageInDatabase(dto: Messages) {
    await prisma.messages.create({
      data: {
        match_id: toId(dto.matchId, 'matchId'),
        content: dto.content,
        sent_at: dto.sentAt,
      },
    });
  }
}
