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
   * Whether the feature is on, for the page to ask before it shows a form and
   * for Discovery and Help to decide what to offer. It is on whenever this
   * answers at all: the guard has already answered 404, with the
   * administrator's message, when it is off. Guest lecturers may ask too, since
   * they see the same Discovery options; the list itself stays coordinator only.
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
