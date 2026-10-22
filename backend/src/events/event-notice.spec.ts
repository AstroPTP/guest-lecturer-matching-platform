import { adminSessionNotice } from './event-notice';

describe('adminSessionNotice', () => {
  const session = {
    title: 'Cloud Security Talk',
    date: '2026-10-15',
    start_time: '10:00',
    end_time: '11:00',
    coordinator_name: 'Dr. Smith',
    guest_lecturer_name: 'Jane Doe',
  };

  it('announces a confirmed session', () => {
    expect(adminSessionNotice(session, 'accepted')).toEqual({
      type: 'event',
      title: 'Guest lecture confirmed',
      description:
        'Cloud Security Talk, 2026-10-15 10:00 to 11:00, Dr. Smith with Jane Doe',
      actionLabel: 'View events',
      href: '/dashboard/events',
    });
  });

  it('announces a cancelled session in the same words, with its own title', () => {
    const confirmed = adminSessionNotice(session, 'accepted');
    const cancelled = adminSessionNotice(session, 'cancelled');

    expect(cancelled.title).toBe('Guest lecture cancelled');
    expect({ ...cancelled, title: confirmed.title }).toEqual(confirmed);
  });

  it('carries no recipient, so it can go to every administrator', () => {
    expect(adminSessionNotice(session, 'cancelled')).not.toHaveProperty(
      'recipientId',
    );
  });
});
