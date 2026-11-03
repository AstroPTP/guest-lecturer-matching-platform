import { prisma } from '../prisma';

/**
 * A report as the specs write it: the 'user.reported' audit entry and, when
 * there is one, its actor's email.
 */
export interface ReportFixture {
  entry_id: bigint;
  actor_user_id?: bigint | null;
  target_id: string | null;
  detail?: unknown;
  occurred_at?: Date;
  actor?: { email: string | null } | null;
}

/** What the open-reports query returns for these reports. */
export function openReportRows(reports: ReportFixture[]) {
  return reports.map((report) => ({
    entry_id: report.entry_id,
    actor_user_id: report.actor_user_id ?? null,
    action: 'user.reported',
    target_type: 'user',
    target_id: report.target_id,
    detail: report.detail ?? null,
    occurred_at: report.occurred_at ?? new Date('2026-10-20T01:00:00.000Z'),
    actor_email: report.actor?.email ?? null,
  }));
}

/**
 * Makes the open-reports query answer with the given reports, one list for
 * each time it is asked. The query already leaves out decided reports, so
 * list only the ones that are still open. Once the lists run out it answers
 * with no reports, like the double.
 */
export function stubOpenReports(...reads: ReportFixture[][]) {
  const query = jest.spyOn(prisma, '$queryRaw');
  for (const reports of reads) {
    query.mockResolvedValueOnce(openReportRows(reports));
  }
  return query;
}

/** Like stubOpenReports, but answers every time it is asked with the same reports. */
export function stubOpenReportsAlways(reports: ReportFixture[]) {
  return jest
    .spyOn(prisma, '$queryRaw')
    .mockResolvedValue(openReportRows(reports));
}
