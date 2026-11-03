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
 * Off by default. It answers only once an administrator has switched ranked
 * matching on in Settings, and never when MATCHING_SUGGESTIONS_ENABLED is
 * "false"; while it is off every route here answers 404.
 */
@Controller('suggestions')
@UseGuards(SuggestionsEnabledGuard)
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  /**
   * Whether the feature is on, for the menu and the page to decide what to
   * show, for Discovery to decide whether to offer the best-match order, and
   * for Help to decide whether to include its questions. It is on whenever
   * this answers at all: the guard has already answered 404, with the
   * administrator's message, when it is off. Guest lecturers may ask too,
   * because they see the same Discovery options and Help has questions for
   * them about being suggested; the list itself stays coordinator only.
   */
  @Get('status')
  @Roles(AppRole.UnitCoordinator, AppRole.GuestSpeaker)
  status() {
    return { enabled: true };
  }

  @Get()
  @Roles(AppRole.UnitCoordinator)
  find(
    @Query() query: SuggestionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suggestionsService.suggest(user.id, query);
  }
}
