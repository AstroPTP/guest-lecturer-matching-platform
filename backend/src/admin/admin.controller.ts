import { Body, Controller, Get, Header, Param, Patch } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { AdminService } from './admin.service';
import { SetUserStatusDto } from './dto/set-user-status.dto';

/**
 * CCAE administrator routes. The class-level @Roles applies to every route,
 * so none of them can be reached by a guest lecturer or unit coordinator.
 */
@Controller('admin')
@Roles(AppRole.CcaeAdmin)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
  setStatus(@Param('id') id: string, @Body() dto: SetUserStatusDto) {
    return this.admin.setStatus(id, dto.status);
  }

  @Get('report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="platform-usage.csv"')
  usageReport() {
    return this.admin.usageReportCsv();
  }
}
