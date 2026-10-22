import type { AdminNotice } from '../notifications/notifications.service';

/** The columns of an event the administrators' notice is written from. */
export interface NoticedSession {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  coordinator_name: string;
  guest_lecturer_name: string;
  /** Set once the guest lecturer has answered; a cancelled session without it was never confirmed. */
  responded_at: Date | null;
}

/**
 * The notice every administrator gets when a guest lecture is confirmed or
 * cancelled: what it was, when, and who it was between. Used wherever a
 * session changes state, so the wording is the same whichever way it got there.
 *
 * Cancelling an invitation that was never answered is reported as a withdrawn
 * invitation, since the administrators were never told it was confirmed.
 */
export function adminSessionNotice(
  session: NoticedSession,
  status: 'accepted' | 'cancelled',
): AdminNotice {
  const title =
    status === 'accepted'
      ? 'Guest lecture confirmed'
      : session.responded_at
        ? 'Guest lecture cancelled'
        : 'Guest lecture invitation withdrawn';

  return {
    type: 'event',
    title,
    description: `${session.title}, ${session.date} ${session.start_time} to ${session.end_time}, ${session.coordinator_name} with ${session.guest_lecturer_name}`,
    actionLabel: 'View events',
    href: '/dashboard/events',
  };
}
