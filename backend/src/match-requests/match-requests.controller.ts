import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { MatchRequestsService } from './match-requests.service';
import { CreateMatchRequestDto } from './dto/create-match-request.dto';

/**
 * The signed-in user's match requests. Every route acts on the caller's own
 * requests, identified from their token.
 */
@Controller('match-requests')
export class MatchRequestsController {
  constructor(private readonly matchRequestsService: MatchRequestsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.matchRequestsService.findMine(user.id);
  }

  @Post()
  create(
    @Body() dto: CreateMatchRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchRequestsService.create(user.id, dto.targetId);
  }

  @Delete(':targetId')
  @HttpCode(204)
  remove(
    @Param('targetId') targetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchRequestsService.remove(user.id, targetId);
  }
}
