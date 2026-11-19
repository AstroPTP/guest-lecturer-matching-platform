import { Controller, Post, Get, Patch, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('prefill/:guestLecturerId')
  @Roles(AppRole.UnitCoordinator)
  prefill(
    @Param('guestLecturerId') guestLecturerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.prefill(guestLecturerId, user.id);
  }

  @Get('coordinator')
  @Roles(AppRole.UnitCoordinator)
  findForCoordinator(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findMine(user.id);
  }

  @Get('guest-lecturer')
  @Roles(AppRole.GuestSpeaker)
  findForGuestLecturer(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findMine(user.id);
  }

  /**
   * The confirmed session as a calendar file. Sent as an attachment and never
   * kept by a cache, since it is the caller's own.
   */
  @Get(':id/calendar.ics')
  @Roles(AppRole.UnitCoordinator, AppRole.GuestSpeaker)
  async calendar(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const { eventId, ics } = await this.eventsService.calendarFile(id, user.id);
    response.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="guest-lecture-${eventId}.ics"`,
      'Cache-Control': 'private, no-store',
    });
    return ics;
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
}
