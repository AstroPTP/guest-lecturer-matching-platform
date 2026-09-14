import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(AppRole.UnitCoordinator)
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.create(dto, user.id);
  }

  @Get('coordinator')
  @Roles(AppRole.UnitCoordinator)
  findForCoordinator(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findByCoordinator(user.id);
  }

  @Get('guest-lecturer')
  @Roles(AppRole.GuestSpeaker)
  findForGuestLecturer(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findByGuestLecturer(user.id);
  }

  @Patch(':id/accept')
  @Roles(AppRole.GuestSpeaker)
  accept(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.updateStatus(id, 'accepted', user.id);
  }

  @Patch(':id/decline')
  @Roles(AppRole.GuestSpeaker)
  decline(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.updateStatus(id, 'declined', user.id);
  }

  @Patch(':id/cancel')
  @Roles(AppRole.UnitCoordinator)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.updateStatus(id, 'cancelled', user.id);
  }

  @Patch(':id/complete')
  @Roles(AppRole.UnitCoordinator)
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.updateStatus(id, 'completed', user.id);
  }

  @Get()
  @Public()
  findAll() {
    return this.eventsService.findAll();
  }
}
