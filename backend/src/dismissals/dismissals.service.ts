import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../common/prisma-errors';
import { prisma, resolveUserId, toId } from '../prisma';

type DismissedBy = 'coordinator' | 'guest';

/** Which side the caller is on, and the id of their own profile row. */
interface CallerSide {
  dismissedBy: DismissedBy;
  ownId: bigint;
}

/** A dismissal as the frontend sees it: which profile, and when. */
export interface Dismissal {
  targetId: string;
  dismissedAt: string;
}

@Injectable()
export class DismissalsService {
  /** The profiles the caller has dismissed, newest first. */
  async findMine(auth0Id: string): Promise<Dismissal[]> {
    const side = await this.resolveSide(auth0Id);
    const rows = await prisma.dismissals.findMany({
      where: {
        dismissed_by: side.dismissedBy,
        ...(side.dismissedBy === 'coordinator'
          ? { coordinator_id: side.ownId }
          : { guest_id: side.ownId }),
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => ({
      targetId: String(
        side.dismissedBy === 'coordinator' ? row.guest_id : row.coordinator_id,
      ),
      dismissedAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Dismisses a profile for the caller.
   *
   * Dismissing the same profile twice is not an error: the write is an upsert,
   * so a double click or a retried request leaves one row rather than failing
   * on the unique constraint.
   */
  async dismiss(auth0Id: string, targetId: string): Promise<Dismissal> {
    const side = await this.resolveSide(auth0Id);
    const target = toId(targetId, 'targetId');
    await this.assertTargetExists(side.dismissedBy, target);

    const pair = this.toPair(side, target);
    const where = { coordinator_id_guest_id_dismissed_by: pair };
    // Upsert on a compound key is a read then a write, so a second click that
    // lands at the same time can lose the race; it then reads the first one's row.
    const row = await prisma.dismissals
      .upsert({ where, update: {}, create: pair })
      .catch(async (error: unknown) => {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        return prisma.dismissals.findUniqueOrThrow({ where });
      });

    return { targetId, dismissedAt: row.created_at.toISOString() };
  }

  /**
   * Brings a dismissed profile back. Removing one that was never dismissed is
   * a no-op rather than an error, so Undo and Restore can't fail on a race.
   */
  async remove(auth0Id: string, targetId: string): Promise<void> {
    const side = await this.resolveSide(auth0Id);
    const pair = this.toPair(side, toId(targetId, 'targetId'));
    await prisma.dismissals.deleteMany({ where: pair });
  }

  /**
   * Works out the caller's side from the profile they own, rather than from a
   * claim in the request, so a caller can only ever dismiss as themselves.
   */
  private async resolveSide(auth0Id: string): Promise<CallerSide> {
    const userId = await resolveUserId(auth0Id);

    const coordinator = await prisma.coordinators.findUnique({
      where: { user_id: userId },
      select: { coordinator_id: true },
    });
    if (coordinator) {
      return { dismissedBy: 'coordinator', ownId: coordinator.coordinator_id };
    }

    const guest = await prisma.guests.findUnique({
      where: { user_id: userId },
      select: { guest_id: true },
    });
    if (guest) {
      return { dismissedBy: 'guest', ownId: guest.guest_id };
    }

    throw new ForbiddenException(
      'Complete your profile before dismissing profiles.',
    );
  }

  /** A coordinator dismisses guests, and a guest dismisses coordinators. */
  private async assertTargetExists(
    dismissedBy: DismissedBy,
    target: bigint,
  ): Promise<void> {
    const exists =
      dismissedBy === 'coordinator'
        ? await prisma.guests.findUnique({
            where: { guest_id: target },
            select: { guest_id: true },
          })
        : await prisma.coordinators.findUnique({
            where: { coordinator_id: target },
            select: { coordinator_id: true },
          });
    if (!exists) {
      throw new NotFoundException('That profile does not exist.');
    }
  }

  private toPair(side: CallerSide, target: bigint) {
    return side.dismissedBy === 'coordinator'
      ? {
          coordinator_id: side.ownId,
          guest_id: target,
          dismissed_by: side.dismissedBy,
        }
      : {
          coordinator_id: target,
          guest_id: side.ownId,
          dismissed_by: side.dismissedBy,
        };
  }
}
