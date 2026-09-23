import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { NotificationsService } from '../notifications/notifications.service';

export type EventStatus =
  | 'invitation-sent'
  | 'accepted'
  | 'declined'
  | 'completed'
  | 'cancelled';

export interface Event extends CreateEventDto {
  id: string;
  coordinatorId: string;
  status: EventStatus;
  createdAt: string;
  respondedAt?: string;
  completedAt?: string;
}

const GUEST_LECTURER_ACTIONS: EventStatus[] = ['accepted', 'declined'];
const COORDINATOR_ACTIONS: EventStatus[] = ['cancelled', 'completed'];

@Injectable()
export class EventsService {
  private events: Event[] = [];
  private nextId = 1;

  constructor(private readonly notificationsService: NotificationsService) {}

  create(dto: CreateEventDto, coordinatorId: string): Event {
    const newEvent: Event = {
      id: String(this.nextId++),
      coordinatorId,
      status: 'invitation-sent',
      createdAt: new Date().toISOString(),
      ...dto,
    };
    this.events.push(newEvent);

    this.notificationsService.create({
      recipientId: newEvent.guestLecturerId,
      type: 'event',
      title: 'New event invitation',
      description: `${newEvent.coordinatorName} invited you to "${newEvent.title}"`,
      actionLabel: 'View invitation',
      href: '/guest_lecturer/events',
    });

    return newEvent;
  }

  findAll(): Event[] {
    return this.events;
  }

  findOne(id: string): Event {
    const event = this.events.find((e) => e.id === id);
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  findByCoordinator(coordinatorId: string): Event[] {
    return this.events.filter((e) => e.coordinatorId === coordinatorId);
  }

  findByGuestLecturer(guestLecturerId: string): Event[] {
    return this.events.filter((e) => e.guestLecturerId === guestLecturerId);
  }

  updateStatus(id: string, status: EventStatus, callerId: string): Event {
    const event = this.findOne(id);

    if (
      GUEST_LECTURER_ACTIONS.includes(status) &&
      event.guestLecturerId !== callerId
    ) {
      throw new ForbiddenException(
        'You are not the invited guest lecturer for this event',
      );
    }
    if (
      COORDINATOR_ACTIONS.includes(status) &&
      event.coordinatorId !== callerId
    ) {
      throw new ForbiddenException(
        'You are not the coordinator for this event',
      );
    }

    event.status = status;
    if (status === 'accepted' || status === 'declined')
      event.respondedAt = new Date().toISOString();
    if (status === 'completed') event.completedAt = new Date().toISOString();

    this.notifyStatusChange(event, status);

    return event;
  }

  private notifyStatusChange(event: Event, status: EventStatus): void {
    if (status === 'accepted' || status === 'declined') {
      this.notificationsService.create({
        recipientId: event.coordinatorId,
        type: 'event',
        title:
          status === 'accepted' ? 'Invitation accepted' : 'Invitation declined',
        description: `${event.guestLecturerName} ${status} your invitation to "${event.title}"`,
        actionLabel: 'View event',
        href: '/unit_coordinator/events',
      });
    }

    if (status === 'cancelled' || status === 'completed') {
      this.notificationsService.create({
        recipientId: event.guestLecturerId,
        type: 'event',
        title:
          status === 'cancelled' ? 'Event cancelled' : 'Event marked complete',
        description: `"${event.title}" was ${status} by ${event.coordinatorName}`,
        actionLabel: 'View event',
        href: '/guest_lecturer/events',
      });
    }
  }
}
