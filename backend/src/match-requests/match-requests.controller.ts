import { Controller, Post, Get, Body } from '@nestjs/common';
import { MatchRequestsService } from './match-requests.service';
import { CreateMatchRequestDto } from './dto/create-match-request.dto';

@Controller('match-requests')
export class MatchRequestsController {
  constructor(private readonly matchRequestsService: MatchRequestsService) {}

  @Post()
  create(@Body() createMatchRequestDto: CreateMatchRequestDto) {
    return this.matchRequestsService.create(createMatchRequestDto);
  }

  @Get()
  findAll() {
    return this.matchRequestsService.findAll();
  }
}