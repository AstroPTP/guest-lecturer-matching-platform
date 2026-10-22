import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
import { SystemService } from './system.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';

/**
 * CCAE administrator routes. The class-level @Roles applies to every route,
 * so none of them can be reached by a guest lecturer or unit coordinator.
 */
@Controller('admin')
@Roles(AppRole.CcaeAdmin)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly governance: GovernanceService,
    private readonly systemHealth: SystemService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('contacts-per-coordinator')
  contactsPerCoordinator() {
    return this.admin.contactsPerCoordinator();
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Patch('users/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.setStatus(id, dto.status, user.id);
  }

  @Get('report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="platform-usage.csv"')
  usageReport() {
    return this.admin.usageReportCsv();
  }

  @Get('reviews')
  pendingReviews() {
    return this.governance.pendingReviews();
  }

  @Patch('reviews/:guestId/approve')
  approve(
    @Param('guestId') guestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.approve(guestId, user.id);
  }

  @Get('settings')
  settings() {
    return this.governance.settings();
  }

  @Patch('settings')
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.updateSettings(dto, user.id);
  }

  @Get('audit-entries')
  auditEntries(
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    return this.governance.auditEntries(
      limit ? Number(limit) || undefined : undefined,
      action,
    );
  }

  @Get('events')
  events() {
    return this.governance.events();
  }

  @Get('reports')
  openReports() {
    return this.governance.openReports();
  }

  @Patch('reports/:id')
  resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.resolveReport(id, dto.outcome, user.id);
  }

  @Post('reports/:id/hold')
  holdReported(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.governance.hold(id, user.id);
  }

  @Get('system')
  systemSnapshot() {
    return this.systemHealth.snapshot();
  }

  @Get('system/security')
  systemSecurity() {
    return this.systemHealth.security();
  }
}
