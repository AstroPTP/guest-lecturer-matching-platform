import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { prisma, toId } from '../prisma';
import { AdminService } from './admin.service';
import { readSettings, recordAudit } from './platform-rules';
import { MIN_FIT_WEIGHT_PERCENT } from '../suggestions/matching-settings';
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
  constructor(private readonly admin: AdminService) {}

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
      suggestionsEnabled: s.suggestions_enabled,
      suggestionsFitWeight: s.suggestions_fit_weight,
      suggestionsRotationWeight: s.suggestions_rotation_weight,
      suggestionsExposureWeight: s.suggestions_exposure_weight,
      suggestionsHalfLifeDays: s.suggestions_half_life_days,
      updatedAt: s.updated_at.toISOString(),
    };
  }

  async updateSettings(dto: UpdateSettingsDto, actor: string) {
    const before = await this.settings();
    this.assertSuggestionWeights(dto, before);
    await prisma.admin_settings.update({
      where: { id: 1 },
      data: {
        system_name: dto.systemName,
        support_email: dto.supportEmail,
        require_admin_approval: dto.requireAdminApproval,
        contact_limit_days: dto.contactLimitDays,
        suggestions_enabled: dto.suggestionsEnabled,
        suggestions_fit_weight: dto.suggestionsFitWeight,
        suggestions_rotation_weight: dto.suggestionsRotationWeight,
        suggestions_exposure_weight: dto.suggestionsExposureWeight,
        suggestions_half_life_days: dto.suggestionsHalfLifeDays,
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

  /**
   * The three Suggested speakers weights are percentages of one score, so they
   * must add up to 100. That depends on all three, so it cannot be checked on
   * one field in the DTO. A patch that names any of them is checked as it
   * would be once applied, against what is stored for the ones it leaves out.
   * The database refuses the same values with a check constraint, but that
   * would surface as a 500 rather than a message.
   */
  private assertSuggestionWeights(
    dto: UpdateSettingsDto,
    current: Awaited<ReturnType<GovernanceService['settings']>>,
  ) {
    const named = [
      dto.suggestionsFitWeight,
      dto.suggestionsRotationWeight,
      dto.suggestionsExposureWeight,
    ].some((weight) => weight !== undefined);
    if (!named) {
      return;
    }

    const fit = dto.suggestionsFitWeight ?? current.suggestionsFitWeight;
    const rotation =
      dto.suggestionsRotationWeight ?? current.suggestionsRotationWeight;
    const exposure =
      dto.suggestionsExposureWeight ?? current.suggestionsExposureWeight;

    if (fit + rotation + exposure !== 100) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: `The three weights must add up to 100 (they add up to ${fit + rotation + exposure}). Send all three together.`,
      });
    }
    if (fit < MIN_FIT_WEIGHT_PERCENT) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: `Topic fit must be at least ${MIN_FIT_WEIGHT_PERCENT}, so it always counts most.`,
      });
    }
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
   * Lets any signed-in user report another. Stored in the audit trail, which
   * is append-only, so the person reported cannot remove the report.
   */
  async report(reporter: string, dto: CreateReportDto) {
    const reported = await prisma.users.findUnique({
      where: { userid: toId(dto.reportedUserId, 'reportedUserId') },
      select: { userid: true, auth0Id: true },
    });
    if (!reported) {
      throw new NotFoundException('No user with that id.');
    }
    if (reported.auth0Id === reporter) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: 'You cannot report yourself.',
      });
    }
    const entry = await recordAudit(
      reporter,
      'user.reported',
      { type: 'user', id: dto.reportedUserId },
      { reason: dto.reason },
    );
    return {
      id: entry.entry_id.toString(),
      createdAt: entry.occurred_at.toISOString(),
    };
  }

  /** Reports nobody has resolved yet, oldest first. */
  async openReports() {
    const [reports, resolutions] = await Promise.all([
      prisma.audit_entries.findMany({
        where: { action: 'user.reported' },
        orderBy: { occurred_at: 'asc' },
        include: { actor: { select: { email: true } } },
      }),
      prisma.audit_entries.findMany({
        where: { action: 'report.resolved' },
        select: { target_id: true },
      }),
    ]);
    const resolved = new Set(resolutions.map((r) => r.target_id));
    const open = reports.filter((r) => !resolved.has(r.entry_id.toString()));

    const reportedIds = [
      ...new Set(open.flatMap((r) => (r.target_id ? [r.target_id] : []))),
    ];
    const people = await prisma.users.findMany({
      where: { userid: { in: reportedIds.map((id) => toId(id, 'id')) } },
      select: { userid: true, email: true, role: true, deletedat: true },
    });
    const byId = new Map(people.map((p) => [p.userid.toString(), p]));

    return open.map((r) => {
      const person = r.target_id ? byId.get(r.target_id) : undefined;
      const detail = (r.detail ?? {}) as { reason?: string };
      return {
        id: r.entry_id.toString(),
        reason: detail.reason ?? '',
        reporterEmail: r.actor?.email ?? null,
        reportedUserId: r.target_id,
        reportedEmail: person?.email ?? null,
        reportedRole: person?.role ?? null,
        reportedStatus: person?.deletedat ? 'deactivated' : 'active',
        reportedAt: r.occurred_at.toISOString(),
      };
    });
  }

  /** Closes a report, optionally deactivating the account it is about. */
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
    if (outcome === 'deactivated' && report.target_id) {
      await this.admin.setStatus(report.target_id, 'deactivated', actor);
    }
    await recordAudit(
      actor,
      'report.resolved',
      { type: 'report', id: reportId },
      { outcome },
    );
    return { id: reportId, outcome };
  }
}
