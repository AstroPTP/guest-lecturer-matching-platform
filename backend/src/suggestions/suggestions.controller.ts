import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { SuggestionsQueryDto } from './dto/suggestions-query.dto';
import { SuggestionsEnabledGuard } from './suggestions-enabled.guard';
import { SuggestionsService } from './suggestions.service';

/**
 * Suggested speakers for a unit coordinator. Read only: it ranks lecturers and
 * changes nothing, so asking twice gives the same list.
 *
 * Off when MATCHING_SUGGESTIONS_ENABLED is "false", in which case every route
 * here answers 404.
 */
@Controller('suggestions')
@UseGuards(SuggestionsEnabledGuard)
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get()
  @Roles(AppRole.UnitCoordinator)
  find(
    @Query() query: SuggestionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suggestionsService.suggest(user.id, query);
  }
}
