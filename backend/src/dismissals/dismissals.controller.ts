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
import { DismissalsService } from './dismissals.service';
import { CreateDismissalDto } from './dto/create-dismissal.dto';

/**
 * Profiles the signed-in user has hidden from Discovery. Every route acts on
 * the caller's own dismissals, identified from their token.
 */
@Controller('dismissals')
export class DismissalsController {
  constructor(private readonly dismissalsService: DismissalsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.dismissalsService.findMine(user.id);
  }

  @Post()
  dismiss(
    @Body() dto: CreateDismissalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dismissalsService.dismiss(user.id, dto.targetId);
  }

  @Delete(':targetId')
  @HttpCode(204)
  remove(
    @Param('targetId') targetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dismissalsService.remove(user.id, targetId);
  }
}
