import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { MessagesService } from './messages.service';
import { CreateMessagesDto } from './dto/create-messages.dto';

/**
 * The signed-in user's conversations. A conversation is addressed by the other
 * person's profile id; the caller's own side comes from their token.
 */
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findSummaries(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findSummaries(user.id);
  }

  @Get(':targetId')
  findThread(
    @Param('targetId') targetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messagesService.findThread(user.id, targetId);
  }

  @Post()
  send(@Body() dto: CreateMessagesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.send(user.id, dto.targetId, dto.content);
  }
}
