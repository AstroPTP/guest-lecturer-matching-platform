import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { prisma, toId } from '../prisma';
import { MatchRequestsService } from '../match-requests/match-requests.service';
import { AdminService } from './admin.service';
import {
  assertReporterWithinLimits,
  findOpenReports,
  isMatchReport,
  loadModerationState,
  lockReported,
  lockReporter,
} from './open-reports';
import { readSettings, recordAudit } from './platform-rules';
import type { UpdateSettingsDto } from './dto/update-settings.dto';
import type { CreateReportDto } from './dto/create-report.dto';

const fullName = (
  p?: { first_name?: string | null; last_name?: string | null } | null,
) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null;

/**
 * The administrator's oversight tools: the verification queue, settings, the
 * audit log, events, and the moderation queue for reported users.
 *
 * Every change an administrator makes here is written to the audit trail.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly admin: AdminService,
    private readonly matchRequests: MatchRequestsService,
  ) {}

  /** Guest lecturer profiles not yet approved, oldest first. */
  async pendingReviews() {
    const rows = await prisma.guests.findMany({
      where: { approved_at: null },
      orderBy: { created_at: 'asc' },
      select: {
        guest_id: true,
        user_id: true,
        first_name: true,
        last_name: true,
        field: true,
        role: true,
        created_at: true,
        users: { select: { email: true, deletedat: true } },
      },
    });
    return rows
      .filter((g) => !g.users?.deletedat)
      .map((g) => ({
        guestId: g.guest_id.toString(),
        userId: g.user_id?.toString() ?? null,
        name: fullName(g) ?? 'Unnamed lecturer',
        field: g.field,
        role: g.role,
        email: g.users?.email ?? null,
        submittedAt: g.created_at.toISOString(),
      }));
  }

  async approve(guestId: string, actor: string) {
    const id = toId(guestId, 'guestId');
    const guest = await prisma.guests.findUnique({
      where: { guest_id: id },
      select: { guest_id: true },
    });
    if (!guest) {
      throw new NotFoundException('No guest lecturer with that id.');
    }
    const updated = await prisma.guests.update({
      where: { guest_id: id },
      data: { approved_at: new Date() },
      select: { guest_id: true, approved_at: true },
    });
    await recordAudit(actor, 'guest.approved', {
      type: 'guest',
      id: guestId,
    });
    return {
      guestId: updated.guest_id.toString(),
      approvedAt: updated.approved_at?.toISOString() ?? null,
    };
  }

  async settings() {
    const s = await readSettings();
    return {
      systemName: s.system_name,
      supportEmail: s.support_email,
      requireAdminApproval: s.require_admin_approval,
      contactLimitDays: s.contact_limit_days,
      updatedAt: s.updated_at.toISOString(),
    };
  }

  async updateSettings(dto: UpdateSettingsDto, actor: string) {
    const before = await this.settings();
    await prisma.admin_settings.update({
      where: { id: 1 },
      data: {
        system_name: dto.systemName,
        support_email: dto.supportEmail,
        require_admin_approval: dto.requireAdminApproval,
        contact_limit_days: dto.contactLimitDays,
        updated_at: new Date(),
      },
    });
    const after = await this.settings();

    const changed = Object.fromEntries(
      (Object.keys(dto) as (keyof UpdateSettingsDto)[])
        .filter((key) => before[key] !== after[key])
        .map((key) => [key, { from: before[key], to: after[key] }]),
    );
    if (Object.keys(changed).length > 0) {
      await recordAudit(
        actor,
        'settings.updated',
        { type: 'settings' },
        changed,
      );
    }
    return after;
  }

  /** Newest first. `action` narrows to one kind, e.g. "user.deactivated". */
  async auditEntries(limit = 200, action?: string) {
    const rows = await prisma.audit_entries.findMany({
      where: action ? { action } : undefined,
      orderBy: { occurred_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: { actor: { select: { email: true, role: true } } },
    });
    return rows.map((r) => ({
      id: r.entry_id.toString(),
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      actorEmail: r.actor?.email ?? null,
      actorRole: r.actor?.role ?? null,
      occurredAt: r.occurred_at.toISOString(),
    }));
  }

  /** Every event on the platform, and how notifications are being used. */
  async events() {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [rows, sent, unread, lastWeek] = await Promise.all([
      prisma.events.findMany({
        orderBy: { created_at: 'desc' },
        take: 200,
        select: {
          event_id: true,
          title: true,
          coordinator_name: true,
          guest_lecturer_name: true,
          date: true,
          start_time: true,
          format: true,
          status: true,
        },
      }),
      prisma.notifications.count(),
      prisma.notifications.count({ where: { read: false } }),
      prisma.notifications.count({ where: { created_at: { gte: since } } }),
    ]);
    return {
      events: rows.map((e) => ({
        id: e.event_id.toString(),
        title: e.title,
        coordinator: e.coordinator_name,
        guestLecturer: e.guest_lecturer_name,
        date: e.date,
        startTime: e.start_time,
        format: e.format,
        status: e.status,
      })),
      notifications: { sent, unread, lastSevenDays: lastWeek },
    };
  }

  /**
   * Lets a signed-in user report the person on the other side of a match they
   * are in, accepted or since ended. Stored in the audit trail, which is
   * append-only, so the person reported cannot remove the report.
   *
   * The report names a profile (`targetId`). It is only accepted from someone
   * with a match with that profile, and the person reported is found from the
   * match rather than taken from the caller.
   *
   * While it is open, the reporter and the person reported cannot see or
   * message each other. It holds the person for everyone only once enough
   * different people have reported them, or an administrator holds them.
   *
   * A reporter may have only a few reports open at once, and may not report
   * the same person twice while one is open.
   */
  report(reporter: string, dto: CreateReportDto) {
    return this.reportMatchedPerson(reporter, dto.targetId, dto.reason);
  }

  private async reportMatchedPerson(
    reporter: string,
    targetId: string,
    reason: string,
  ) {
    const match = await this.matchRequests.findAcceptedCounterpart(
      reporter,
      targetId,
    );
    if (match.counterpartUserId === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'That person has no account to report.',
      });
    }
    if (match.counterpartUserId === match.callerUserId) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: 'You cannot report yourself.',
      });
    }
    return this.storeReport(
      reporter,
      match.callerUserId,
      match.counterpartUserId,
      { reason, matchId: match.matchId.toString() },
    );
  }

  /**
   * Checks the limits and stores the report in one transaction that holds a
   * lock on the reporter. Without it, two reports sent together would both
   * read the same count of open reports, both pass, and both be stored.
   */
  private storeReport(
    reporter: string,
    reporterUserId: bigint,
    reportedUserId: bigint,
    detail: { reason: string; matchId: string },
  ) {
    return prisma.$transaction(async (tx) => {
      await lockReporter(tx, reporterUserId);
      assertReporterWithinLimits(
        await findOpenReports(tx),
        reporterUserId,
        reportedUserId,
      );
      const entry = await recordAudit(
        reporter,
        'user.reported',
        { type: 'user', id: reportedUserId.toString() },
        detail,
        tx,
      );
      return {
        id: entry.entry_id.toString(),
        createdAt: entry.occurred_at.toISOString(),
      };
    });
  }

  /**
   * Reports nobody has resolved yet, oldest first. Each says who reported
   * whom, in what role, and which match it came from. For the person
   * reported it also says how many different people have an open report
   * about them, and whether they are on hold for everyone and why.
   */
  async openReports() {
    const state = await loadModerationState();
    const open = state.reports;

    const userIds = [
      ...new Set(
        open.flatMap((r) => {
          const ids: bigint[] = [];
          if (typeof r.actor_user_id === 'bigint') ids.push(r.actor_user_id);
          if (r.target_id) ids.push(toId(r.target_id, 'id'));
          return ids;
        }),
      ),
    ];
    const names = { first_name: true, last_name: true, user_id: true };
    const [people, guests, coordinators] = await Promise.all([
      prisma.users.findMany({
        where: { userid: { in: userIds } },
        select: { userid: true, email: true, role: true, deletedat: true },
      }),
      prisma.guests.findMany({
        where: { user_id: { in: userIds } },
        select: names,
      }),
      prisma.coordinators.findMany({
        where: { user_id: { in: userIds } },
        select: names,
      }),
    ]);
    const byId = new Map(people.map((p) => [p.userid.toString(), p]));
    const nameOf = new Map(
      [...guests, ...coordinators].map((p) => [String(p.user_id), fullName(p)]),
    );

    return open.map((r) => {
      const person = r.target_id ? byId.get(r.target_id) : undefined;
      const reporter = byId.get(String(r.actor_user_id));
      const detail = (r.detail ?? {}) as { reason?: string; matchId?: string };
      const target = r.target_id ? toId(r.target_id, 'id') : null;
      const holdReasons = (target !== null && state.held.get(target)) || [];
      // Whether the administrator's hold on this person was placed for this
      // report, so the page can offer a hold on a report the current one
      // does not cover, such as one raised after it.
      const coveredByHold =
        target !== null &&
        state.adminHeld.has(target) &&
        (state.adminHolds.get(target)?.has(r.entry_id.toString()) ?? false);
      return {
        id: r.entry_id.toString(),
        reason: detail.reason ?? '',
        reporterEmail: r.actor?.email ?? null,
        reporterName: nameOf.get(String(r.actor_user_id)) ?? null,
        reporterRole: reporter?.role ?? null,
        reportedUserId: r.target_id,
        reportedEmail: person?.email ?? null,
        reportedName: nameOf.get(String(r.target_id)) ?? null,
        reportedRole: person?.role ?? null,
        reportedStatus: person?.deletedat ? 'deactivated' : 'active',
        matchId: detail.matchId ?? null,
        openReporters:
          (target !== null && state.reporters.get(target)?.size) || 0,
        holdThreshold: state.threshold,
        onHold: holdReasons.length > 0,
        holdReasons,
        coveredByHold,
        reportedAt: r.occurred_at.toISOString(),
      };
    });
  }

  /**
   * Holds the person a report is about, for everyone, until an administrator
   * decides: they are left out of Discovery and cannot send or receive
   * messages. It needs at least one open report raised from a match, because a
   * report made without one proves nothing about the two ever dealing with
   * each other.
   *
   * The hold names the reports raised from a match that are open about the
   * person now, and counts only while one of them is. Holding someone already
   * held for all of those reports changes nothing. Taken under the person's lock, so it cannot interleave with a
   * decision on one of their reports.
   */
  async hold(reportId: string, actor: string) {
    const report = await prisma.audit_entries.findFirst({
      where: { entry_id: toId(reportId, 'reportId'), action: 'user.reported' },
      select: { entry_id: true, target_id: true },
    });
    if (!report?.target_id) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'No report with that id.',
      });
    }
    const person = toId(report.target_id, 'id');

    return prisma.$transaction(async (tx) => {
      await lockReported(tx, person);
      const state = await loadModerationState(tx);
      if (!state.reports.some((r) => r.entry_id === report.entry_id)) {
        throw new ConflictException({
          code: 'REPORT_ALREADY_DECIDED',
          message: 'That report has already been decided.',
        });
      }

      const about = state.reports.filter(
        (r) => r.target_id === person.toString(),
      );
      // Only reports raised through a match are named: the hold exists because
      // of what happened between the two people in a match, and a report with
      // no match behind it cannot keep a hold alive.
      const matchReportIds = about
        .filter((r) => isMatchReport(r.detail))
        .map((r) => r.entry_id.toString());
      if (matchReportIds.length === 0) {
        throw new ConflictException({
          code: 'HOLD_NEEDS_MATCH_REPORT',
          message:
            'A hold needs at least one open report raised from a match, and this person has none.',
        });
      }

      const covered = state.adminHeld.has(person)
        ? state.adminHolds.get(person)
        : undefined;
      const alreadyCovered =
        covered !== undefined && matchReportIds.every((id) => covered.has(id));
      if (!alreadyCovered) {
        await recordAudit(
          actor,
          'user.held',
          { type: 'user', id: person.toString() },
          { reportId: report.entry_id.toString(), reportIds: matchReportIds },
          tx,
        );
      }
      return { id: report.entry_id.toString(), held: true };
    });
  }

  /**
   * Closes a report, optionally deactivating the account it is about. If that
   * leaves the person no longer on hold, whether from the threshold or from an
   * administrator, the release is recorded. All under the person's lock, so a
   * hold, a decision and a release for the same person run one after another.
   */
  async resolveReport(
    reportId: string,
    outcome: 'dismissed' | 'deactivated',
    actor: string,
  ) {
    const report = await prisma.audit_entries.findFirst({
      where: { entry_id: toId(reportId, 'reportId'), action: 'user.reported' },
      select: { entry_id: true, target_id: true },
    });
    if (!report) {
      throw new NotFoundException('No report with that id.');
    }
    const person = report.target_id ? toId(report.target_id, 'id') : null;

    await prisma.$transaction(async (tx) => {
      if (person !== null) await lockReported(tx, person);
      const before = await loadModerationState(tx);

      if (outcome === 'deactivated' && report.target_id) {
        await this.admin.setStatus(report.target_id, 'deactivated', actor, tx);
      }
      await recordAudit(
        actor,
        'report.resolved',
        { type: 'report', id: report.entry_id.toString() },
        { outcome },
        tx,
      );

      if (person !== null) {
        const after = await loadModerationState(tx);
        if (before.held.has(person) && !after.held.has(person)) {
          await recordAudit(
            actor,
            'user.released',
            { type: 'user', id: person.toString() },
            { reportId: report.entry_id.toString(), outcome },
            tx,
          );
        }
      }
    });
    return { id: report.entry_id.toString(), outcome };
  }
}
