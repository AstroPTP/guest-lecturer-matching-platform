import type { CreateNotificationDto } from '../notifications/dto/create-notification.dto';

/** The columns of an event the administrators' notice is written from. */
export interface NoticedSession {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  coordinator_name: string;
  guest_lecturer_name: string;
}

/**
 * The notice every administrator gets when a guest lecture is confirmed or
 * cancelled: what it was, when, and who it was between. Used wherever a
 * session changes state, so the wording is the same whichever way it got there.
 */
export function adminSessionNotice(
  session: NoticedSession,
  status: 'accepted' | 'cancelled',
): Omit<CreateNotificationDto, 'recipientId'> {
  return {
    type: 'event',
    title:
      status === 'accepted'
        ? 'Guest lecture confirmed'
        : 'Guest lecture cancelled',
    description: `${session.title}, ${session.date} ${session.start_time} to ${session.end_time}, ${session.coordinator_name} with ${session.guest_lecturer_name}`,
    actionLabel: 'View events',
    href: '/dashboard/events',
  };
}
