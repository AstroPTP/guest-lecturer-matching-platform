import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { AppRole } from '../auth/roles';
import { ListSupportThreadsQueryDto } from './dto/list-support-threads-query.dto';
import { OpenSupportThreadDto } from './dto/open-support-thread.dto';
import { SetSupportStatusDto } from './dto/set-support-status.dto';
import { SupportReplyDto } from './dto/support-reply.dto';
import { SupportService } from './support.service';

/**
 * The administrator's side of requests for details. The class-level @Roles
 * applies to every route, so none of them can be reached by a guest lecturer
 * or unit coordinator.
 */
@Controller('admin/support')
@Roles(AppRole.CcaeAdmin)
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Post('threads')
  open(
    @Body() dto: OpenSupportThreadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.openThread(user.id, dto);
  }

  @Get('threads')
  list(@Query() query: ListSupportThreadsQueryDto) {
    return this.support.listThreads(query);
  }

  @Get('threads/:id')
  detail(@Param('id') id: string) {
    return this.support.getThreadForAdmin(id);
  }

  @Post('threads/:id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.adminReply(user.id, id, dto.content);
  }

  @Patch('threads/:id')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetSupportStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.setStatus(user.id, id, dto.status);
  }
}
