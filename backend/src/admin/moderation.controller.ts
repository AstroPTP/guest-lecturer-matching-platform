import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GovernanceService } from './governance.service';
import { CreateReportDto } from './dto/create-report.dto';

/**
 * Reporting another user. Open to any signed-in account, unlike the rest of
 * this module; the reporter is always the token's subject, never the body.
 */
@Controller('moderation')
export class ModerationController {
  constructor(private readonly governance: GovernanceService) {}

  @Post('reports')
  report(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto) {
    return this.governance.report(user.id, dto);
  }
}
