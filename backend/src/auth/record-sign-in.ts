import { Logger } from '@nestjs/common';
import { recordAudit } from '../admin/platform-rules';
import { prisma } from '../prisma';

const signInLogger = new Logger('SignInAudit');

/**
 * Records that a user has been active, for the administrator's "signed in"
 * figure, and leaves one audit entry each time that figure moves.
 *
 * One conditional UPDATE that only writes when the stored time is missing or
 * over an hour old, so a busy session costs one write an hour rather than one
 * per request. The audit entry rides on the same condition: it is written only
 * when that UPDATE really changed a row, so the trail holds one `user.signed_in`
 * per user per hour of activity and not one per request.
 *
 * What this cannot see is a failed sign-in. A wrong password, an unknown
 * account or a blocked user is refused by Auth0 before any token exists, so
 * the request never reaches this API. Those attempts are in the Auth0 tenant
 * log, not here.
 *
 * Called by the guard on every authenticated request, and by the handler that
 * creates a new account's row: that handler runs after the guard, which found
 * no row to update, so without this call the account's first sign-in would
 * wait for its second request.
 *
 * A failure here must never block a request, so the returned promise never
 * rejects. The guard does not wait for it; a test can.
 *
 * @param audit false on the demo bypass, whose simulated user is not a person
 *   who signed in and must not appear in the trail as one.
 */
export function recordSignIn(
  auth0Id: string | undefined,
  { audit }: { audit: boolean },
): Promise<void> {
  if (!auth0Id) return Promise.resolve();
  const hourAgo = new Date(Date.now() - 3_600_000);
  // Started inside .then() so that even a synchronous throw from the client
  // lands in .catch() instead of failing the request.
  return Promise.resolve()
    .then(() =>
      prisma.users.updateMany({
        where: {
          auth0Id,
          deletedat: null,
          OR: [{ lastloginat: null }, { lastloginat: { lt: hourAgo } }],
        },
        data: { lastloginat: new Date() },
      }),
    )
    .then(async ({ count }) => {
      if (!audit || count !== 1) return;
      await auditSignIn(auth0Id);
    })
    .catch(() => undefined);
}

/**
 * The audit entry for a sign-in: the user is both the actor and the target.
 * Its failure is logged and not rethrown, so a fault in the audit table can
 * never stand between a user and the application.
 */
async function auditSignIn(auth0Id: string): Promise<void> {
  try {
    const user = await prisma.users.findFirst({
      where: { auth0Id },
      select: { userid: true },
    });
    // Deleted between the UPDATE and here; there is nobody to record.
    if (!user) return;

    await recordAudit(auth0Id, 'user.signed_in', {
      type: 'user',
      id: user.userid.toString(),
    });
  } catch (error) {
    // The error's own text is left out: a database error can quote the
    // statement and its values, and the Auth0 id is one of them.
    signInLogger.warn(
      `Sign-in audit entry not written (${error instanceof Error ? error.name : 'unknown error'})`,
    );
  }
}
