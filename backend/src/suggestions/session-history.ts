import type { Prisma } from '../../generated/prisma/client';

/**
 * Which events are sessions a lecturer has had, for the rotation and exposure
 * terms of both Suggested speakers and Discovery's order.
 *
 * An event is a session once the lecturer has agreed to it: it is accepted, or
 * it is completed, which an event can only be after being accepted. An
 * invitation still waiting, a declined one and a cancelled one are not
 * sessions. The status of the match the event belongs to is not looked at, so
 * a lecturer keeps their history after a match ends, and a match with no event
 * yet counts for nothing. Each event is one session.
 */
export const SESSION_EVENTS_WHERE: Prisma.eventsWhereInput = {
  status: { in: ['accepted', 'completed'] },
};

/** The columns of an event that the date of its session is read from. */
export interface SessionEventDates {
  date: string;
  completed_at: Date | null;
  created_at: Date;
}

/**
 * When a session took place, for the rotation term: the event's own date, else
 * the moment the coordinator marked it complete, else when it was created. The
 * date is the day the session was held, where the completion time is only when
 * it was marked, which may be months later. It is typed by the coordinator and
 * stored as a string, so one that does not read as a date is not used, and one
 * that does is held between when the event was created and now: a future date
 * reads as now, a back-dated one as created.
 */
export function sessionDate(event: SessionEventDates, now: Date): Date {
  const planned = new Date(event.date);
  if (Number.isNaN(planned.getTime())) {
    return event.completed_at ?? event.created_at;
  }
  return new Date(
    Math.min(
      now.getTime(),
      Math.max(planned.getTime(), event.created_at.getTime()),
    ),
  );
}
