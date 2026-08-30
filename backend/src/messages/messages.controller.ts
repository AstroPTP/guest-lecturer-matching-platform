import { Controller, Post, Get, Body } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessagesDto } from './dto/create-messages.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly MessagesService: MessagesService) {}

  @Post()
  create(@Body() messagesDto: CreateMessagesDto) {
    return this.MessagesService.create(messagesDto);
  }

  @Get()
  findAll() {
    return this.MessagesService.findAll();
  }
}
