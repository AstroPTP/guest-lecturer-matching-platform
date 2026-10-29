import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, toId } from '../prisma';
import { recordAudit } from './platform-rules';
import type { Prisma } from '../../generated/prisma/client';

/** Eight weekly buckets ending now, oldest first, for the registrations chart. */
function lastWeeks(count: number): { label: string; start: Date; end: Date }[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(now - (count - 1 - index) * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return {
      label: start.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
      }),
      start,
      end,
    };
  });
}

const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Number(((part / whole) * 100).toFixed(1));

const fullName = (
  p?: { first_name?: string | null; last_name?: string | null } | null,
) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null;

/**
 * Read-mostly figures for the CCAE administrator.
 *
 * Scoped to what the client asked for: matches made, users who have signed
 * in, contacts made, profiles created, and requests sent per unit
 * coordinator. Everything is counted from tables that already exist, so this
 * module adds no migration.
 */
@Injectable()
export class AdminService {
  async overview() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const weeks = lastWeeks(8);
    const [
      activeUsers,
      deactivatedUsers,
      guestProfiles,
      coordinatorProfiles,
      administrators,
      profilesLast30Days,
      signedInLast30Days,
      byStatus,
      weekly,
      recent,
    ] = await Promise.all([
      prisma.users.count({ where: { deletedat: null } }),
      prisma.users.count({ where: { deletedat: { not: null } } }),
      prisma.guests.count(),
      prisma.coordinators.count(),
      prisma.users.count({ where: { role: 'ccae_admin', deletedat: null } }),
      Promise.all([
        prisma.guests.count({ where: { created_at: { gte: since } } }),
        prisma.coordinators.count({ where: { created_at: { gte: since } } }),
      ]).then(([g, c]) => g + c),
      prisma.users.count({
        where: { lastloginat: { gte: since }, deletedat: null },
      }),
      prisma.match_requests.groupBy({ by: ['status'], _count: { _all: true } }),
      Promise.all(
        weeks.map((w) =>
          prisma.users.count({
            where: { createdat: { gte: w.start, lt: w.end } },
          }),
        ),
      ),
      prisma.users.findMany({
        where: { deletedat: null },
        orderBy: { createdat: 'desc' },
        take: 6,
        select: { userid: true, email: true, role: true, createdat: true },
      }),
    ]);

    const count = (status: string) =>
      byStatus.find((row) => (row.status ?? '').toLowerCase() === status)
        ?._count._all ?? 0;
    const raised = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    const accepted = count('accepted');

    return {
      generatedAt: new Date().toISOString(),
      people: {
        active: activeUsers,
        deactivated: deactivatedUsers,
        guestSpeakers: guestProfiles,
        unitCoordinators: coordinatorProfiles,
        administrators,
      },
      profiles: {
        created: guestProfiles + coordinatorProfiles,
        createdLast30Days: profilesLast30Days,
      },
      signIns: { last30Days: signedInLast30Days },
      contacts: {
        raised,
        accepted,
        declined: count('declined'),
        pending: count('pending'),
        acceptanceRate: percent(accepted, raised),
      },
      registrationsByWeek: weeks.map((w, i) => ({
        label: w.label,
        count: weekly[i],
      })),
      recentRegistrations: recent.map((u) => ({
        id: u.userid.toString(),
        email: u.email ?? '',
        role: u.role ?? '',
        registeredAt: u.createdat?.toISOString() ?? null,
      })),
    };
  }

  /** Contact requests raised by each unit coordinator, most active first. */
  async contactsPerCoordinator() {
    const coordinators = await prisma.coordinators.findMany({
      select: {
        coordinator_id: true,
        user_id: true,
        first_name: true,
        last_name: true,
        faculty: true,
        match_requests: { select: { status: true } },
      },
    });
    return coordinators
      .map((c) => ({
        coordinatorId: c.coordinator_id.toString(),
        userId: c.user_id?.toString() ?? null,
        name: fullName(c) ?? 'Unnamed coordinator',
        faculty: c.faculty,
        requests: c.match_requests.length,
        accepted: c.match_requests.filter(
          (m) => (m.status ?? '').toLowerCase() === 'accepted',
        ).length,
      }))
      .sort((a, b) => b.requests - a.requests);
  }

  /** Every account with the profile behind it, for the user directory. */
  async users() {
    const rows = await prisma.users.findMany({
      orderBy: { createdat: 'desc' },
      select: {
        userid: true,
        email: true,
        role: true,
        createdat: true,
        lastloginat: true,
        deletedat: true,
        guest: {
          select: {
            guest_id: true,
            first_name: true,
            last_name: true,
            field: true,
          },
        },
        coordinator: {
          select: {
            coordinator_id: true,
            first_name: true,
            last_name: true,
            faculty: true,
          },
        },
      },
    });
    return rows.map((u) => ({
      id: u.userid.toString(),
      email: u.email,
      role: u.role,
      name: fullName(u.guest) ?? fullName(u.coordinator),
      detail: u.guest?.field ?? u.coordinator?.faculty ?? null,
      status: u.deletedat ? 'deactivated' : 'active',
      registeredAt: u.createdat?.toISOString() ?? null,
      lastSignInAt: u.lastloginat?.toISOString() ?? null,
    }));
  }

  /**
   * Deactivates or reactivates an account.
   *
   * Uses the same `deletedat` marker as account deletion, which JwtAuthGuard
   * already refuses, so a deactivated user is locked out on their next request
   * without a second mechanism. Reactivating clears it.
   *
   * Pass a transaction's client as `db` to make the status change and its audit
   * entry part of that transaction, as deciding a report does.
   */
  async setStatus(
    id: string,
    status: 'active' | 'deactivated',
    actor: string | null = null,
    db: Prisma.TransactionClient = prisma,
  ) {
    const userid = toId(id, 'id');
    const exists = await db.users.findUnique({
      where: { userid },
      select: { userid: true },
    });
    if (!exists) {
      throw new NotFoundException('No user with that id.');
    }
    const updated = await db.users.update({
      where: { userid },
      data: { deletedat: status === 'deactivated' ? new Date() : null },
      select: { userid: true, deletedat: true },
    });
    await recordAudit(
      actor,
      status === 'deactivated' ? 'user.deactivated' : 'user.reactivated',
      { type: 'user', id: updated.userid.toString() },
      undefined,
      db,
    );
    return {
      id: updated.userid.toString(),
      status: updated.deletedat ? 'deactivated' : 'active',
    };
  }

  /** The platform usage report, as CSV, for "generate reports on platform usage". */
  async usageReportCsv(): Promise<string> {
    const [overview, perCoordinator] = await Promise.all([
      this.overview(),
      this.contactsPerCoordinator(),
    ]);
    // Names are typed by users. A leading = + - @ would run as a formula when
    // the report is opened in a spreadsheet, so it is prefixed with a quote.
    const esc = (v: string | number | null) => {
      const text = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [
      'section,metric,value',
      `summary,active users,${overview.people.active}`,
      `summary,deactivated users,${overview.people.deactivated}`,
      `summary,guest lecturer profiles,${overview.people.guestSpeakers}`,
      `summary,unit coordinator profiles,${overview.people.unitCoordinators}`,
      `summary,profiles created in last 30 days,${overview.profiles.createdLast30Days}`,
      `summary,users signed in during last 30 days,${overview.signIns.last30Days}`,
      `summary,contact requests raised,${overview.contacts.raised}`,
      `summary,matches made (accepted),${overview.contacts.accepted}`,
      `summary,acceptance rate %,${overview.contacts.acceptanceRate}`,
      '',
      'coordinator,faculty,requests,accepted',
      ...perCoordinator.map((c) =>
        [c.name, c.faculty, c.requests, c.accepted].map(esc).join(','),
      ),
    ];
    return lines.join('\n');
  }
}
