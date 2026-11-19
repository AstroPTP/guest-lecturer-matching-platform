import { adminSessionNotice } from './event-notice';

describe('adminSessionNotice', () => {
  const answered = new Date('2026-10-02T03:00:00.000Z');
  const session = {
    title: 'Cloud Security Talk',
    date: '2026-10-15',
    start_time: '10:00',
    end_time: '11:00',
    coordinator_name: 'Dr. Smith',
    guest_lecturer_name: 'Jane Doe',
    responded_at: answered as Date | null,
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

  it('announces the cancellation of a confirmed session in the same words', () => {
    const confirmed = adminSessionNotice(session, 'accepted');
    const cancelled = adminSessionNotice(session, 'cancelled');

    expect(cancelled.title).toBe('Guest lecture cancelled');
    expect({ ...cancelled, title: confirmed.title }).toEqual(confirmed);
  });

  it('calls the cancellation of an invitation nobody answered a withdrawn invitation', () => {
    const withdrawn = adminSessionNotice(
      { ...session, responded_at: null },
      'cancelled',
    );

    expect(withdrawn.title).toBe('Guest lecture invitation withdrawn');
    expect(withdrawn.description).toBe(
      'Cloud Security Talk, 2026-10-15 10:00 to 11:00, Dr. Smith with Jane Doe',
    );
  });

  it('never calls a confirmation a withdrawal', () => {
    expect(
      adminSessionNotice({ ...session, responded_at: null }, 'accepted').title,
    ).toBe('Guest lecture confirmed');
  });

  it('carries no recipient, so it can go to every administrator', () => {
    expect(adminSessionNotice(session, 'cancelled')).not.toHaveProperty(
      'recipientId',
    );
  });
});
