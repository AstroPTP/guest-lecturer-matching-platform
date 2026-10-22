import { NotFoundException } from '@nestjs/common';
import { prisma } from '../prisma';
import { ImagesService } from './images.service';

type Row = Record<string, unknown>;

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Just enough of Prisma's filter language to evaluate the one query under
 * test against in-memory rows. A filter it does not know throws, so a rewrite
 * of the query to something else fails loudly instead of passing by accident.
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Row[]).every((part) => matches(row, part));
    }
    if (key === 'OR') {
      return (condition as Row[]).some((part) => matches(row, part));
    }
    const value = row[key];
    if (isRecord(condition)) {
      if ('is' in condition) {
        return isRecord(value) && matches(value, condition.is as Row);
      }
      if ('some' in condition) {
        return (value as Row[]).some((item) =>
          matches(item, condition.some as Row),
        );
      }
      if ('not' in condition) {
        return value !== condition.not;
      }
      if ('notIn' in condition) {
        return !(condition.notIn as unknown[]).includes(value);
      }
      throw new Error(`Unsupported filter on ${key}`);
    }
    return value === condition;
  });
}

const active = (auth0Id: string): Row => ({ auth0Id, deletedat: null });
const deactivated = (auth0Id: string): Row => ({
  auth0Id,
  deletedat: new Date('2026-10-01T00:00:00Z'),
});

/** A profile row as the photo query sees it: the owner's account is joined on. */
const profile = (
  owner: Row | null,
  approved = true,
  userId: bigint | null = owner ? 1n : null,
): Row => ({
  user_id: userId,
  users: owner,
  approved_at: approved ? new Date('2026-09-01T00:00:00Z') : null,
});

const photo = (
  id: bigint,
  holders: { guests?: Row[]; coordinators?: Row[] },
): Row => ({
  image_id: id,
  mime_type: 'image/png',
  filename: `${id}.png`,
  image_data: new Uint8Array([1, 2, 3]),
  guests: holders.guests ?? [],
  coordinators: holders.coordinators ?? [],
});

const MINE = 10n;
const OTHER_GUEST = 20n;
const OTHER_COORDINATOR = 30n;
const DEACTIVATED_GUEST = 40n;
const DEACTIVATED_COORDINATOR = 50n;
const UNAPPROVED_GUEST = 60n;
const GUEST_WITHOUT_ACCOUNT = 70n;
const ORPHAN = 80n;
const UNKNOWN = 999n;
const REPORTED_GUEST = 90n;
const REPORTED_COORDINATOR = 91n;

const stored = [
  photo(MINE, { guests: [profile(active('auth0|me'), false)] }),
  photo(OTHER_GUEST, { guests: [profile(active('auth0|guest'))] }),
  photo(OTHER_COORDINATOR, {
    coordinators: [profile(active('auth0|coordinator'))],
  }),
  photo(DEACTIVATED_GUEST, { guests: [profile(deactivated('auth0|gone-g'))] }),
  photo(DEACTIVATED_COORDINATOR, {
    coordinators: [profile(deactivated('auth0|gone-c'))],
  }),
  photo(UNAPPROVED_GUEST, {
    guests: [profile(active('auth0|pending'), false)],
  }),
  photo(GUEST_WITHOUT_ACCOUNT, { guests: [profile(null)] }),
  // Uploaded, then no longer on any profile.
  photo(ORPHAN, {}),
  // People other tests report. Their account ids are 101 and 102; the test
  // double signs every viewer in as user 1.
  photo(REPORTED_GUEST, {
    guests: [profile(active('auth0|reported-g'), true, 101n)],
  }),
  photo(REPORTED_COORDINATOR, {
    coordinators: [profile(active('auth0|reported-c'), true, 102n)],
  }),
];

function serveStoredImages(approvalRequired: boolean) {
  jest
    .spyOn(prisma.admin_settings, 'upsert')
    .mockResolvedValue({ require_admin_approval: approvalRequired } as never);
  return jest
    .spyOn(prisma.images, 'findFirst')
    .mockImplementation(((args: { where: Row }) =>
      Promise.resolve(
        stored.find((image) => matches(image, args.where)) ?? null,
      )) as never);
}

describe('ImagesService.getVisibleTo', () => {
  const service = new ImagesService();
  const asMe = (id: bigint) => service.getVisibleTo(id, 'auth0|me');

  afterEach(() => jest.restoreAllMocks());

  describe('when approval is not required', () => {
    beforeEach(() => serveStoredImages(false));

    it('serves the caller their own photo', async () => {
      await expect(asMe(MINE)).resolves.toMatchObject({ image_id: MINE });
    });

    it("serves a listed guest lecturer's photo to someone else", async () => {
      await expect(asMe(OTHER_GUEST)).resolves.toMatchObject({
        image_id: OTHER_GUEST,
      });
    });

    it("serves a listed coordinator's photo to someone else", async () => {
      await expect(asMe(OTHER_COORDINATOR)).resolves.toMatchObject({
        image_id: OTHER_COORDINATOR,
      });
    });

    it('serves a photo whose profile has no account attached, as the lists do', async () => {
      await expect(asMe(GUEST_WITHOUT_ACCOUNT)).resolves.toMatchObject({
        image_id: GUEST_WITHOUT_ACCOUNT,
      });
    });

    it('serves a guest lecturer who is not yet approved, since nothing requires it', async () => {
      await expect(asMe(UNAPPROVED_GUEST)).resolves.toMatchObject({
        image_id: UNAPPROVED_GUEST,
      });
    });

    it.each([
      ['a deactivated guest lecturer', DEACTIVATED_GUEST],
      ['a deactivated coordinator', DEACTIVATED_COORDINATOR],
      ['a photo that is on no profile', ORPHAN],
      ['an id that was never issued', UNKNOWN],
    ])('answers 404 for the photo of %s', async (_what, id) => {
      await expect(asMe(id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('when an administrator requires approval', () => {
    beforeEach(() => serveStoredImages(true));

    it('hides the photo of a guest lecturer who is not approved', async () => {
      await expect(asMe(UNAPPROVED_GUEST)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('still serves that guest lecturer their own photo', async () => {
      await expect(
        service.getVisibleTo(UNAPPROVED_GUEST, 'auth0|pending'),
      ).resolves.toMatchObject({ image_id: UNAPPROVED_GUEST });
    });

    it('still serves the caller their own photo while they wait for approval', async () => {
      await expect(asMe(MINE)).resolves.toMatchObject({ image_id: MINE });
    });

    it('keeps serving approved guest lecturers and coordinators', async () => {
      await expect(asMe(OTHER_GUEST)).resolves.toBeDefined();
      await expect(asMe(OTHER_COORDINATOR)).resolves.toBeDefined();
    });
  });

  it('gives a hidden photo the same answer as one that does not exist', async () => {
    serveStoredImages(false);

    const hidden = await asMe(DEACTIVATED_GUEST).catch((e: unknown) => e);
    const missing = await asMe(UNKNOWN).catch((e: unknown) => e);

    expect(hidden).toBeInstanceOf(NotFoundException);
    expect((hidden as NotFoundException).getResponse()).toEqual(
      (missing as NotFoundException).getResponse(),
    );
  });

  it('does not treat someone else as the owner', async () => {
    serveStoredImages(true);

    await expect(
      service.getVisibleTo(UNAPPROVED_GUEST, 'auth0|someone-else'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['zero', 0n],
    ['a negative number', -5n],
    ['a number too large for the column', 2n ** 63n],
  ])('answers 404 for %s without querying', async (_what, id) => {
    const query = serveStoredImages(false);

    await expect(asMe(id)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('asks for one image by id, never a list', async () => {
    const query = serveStoredImages(false);

    await asMe(OTHER_GUEST);

    expect(query.mock.calls[0][0]).toMatchObject({
      where: { image_id: OTHER_GUEST },
    });
  });
});

describe('ImagesService.getVisibleTo after reports', () => {
  const service = new ImagesService();
  const asMe = (id: bigint) => service.getVisibleTo(id, 'auth0|me');

  afterEach(() => jest.restoreAllMocks());

  /** An open report by `reporter` about `reported`, raised from a match. */
  const report = (id: bigint, reporter: bigint, reported: bigint) => ({
    entry_id: id,
    actor_user_id: reporter,
    target_id: reported.toString(),
    detail: { reason: 'asked for money', matchId: '6001' },
    actor: null,
  });

  /** The audit trail, answering whichever read the code makes. */
  function auditTrail(
    reports: object[],
    options: { resolved?: string[]; held?: bigint[] } = {},
  ) {
    jest.spyOn(prisma.audit_entries, 'findMany').mockImplementation(((args: {
      where: { action: string | { in: string[] } };
    }) => {
      const action = args.where.action;
      if (action === 'user.reported') return Promise.resolve(reports);
      if (action === 'report.resolved') {
        return Promise.resolve(
          (options.resolved ?? []).map((target_id) => ({ target_id })),
        );
      }
      // A hold names the reports open about that person when it was placed.
      return Promise.resolve(
        (options.held ?? []).map((person) => ({
          action: 'user.held',
          target_id: person.toString(),
          detail: {
            reportIds: (reports as { entry_id: bigint; target_id: string }[])
              .filter((r) => r.target_id === person.toString())
              .map((r) => r.entry_id.toString()),
          },
        })),
      );
    }) as never);
    serveStoredImages(false);
  }

  describe('a pair with an open report between them', () => {
    it('stops the reporter fetching the reported guest lecturer’s photo', async () => {
      auditTrail([report(1n, 1n, 101n)]);

      await expect(asMe(REPORTED_GUEST)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stops the reporter fetching the reported coordinator’s photo', async () => {
      auditTrail([report(1n, 1n, 102n)]);

      await expect(asMe(REPORTED_COORDINATOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stops the reported person fetching the reporter’s photo', async () => {
      // Person 101 reported the viewer (user 1), so the viewer may not see 101.
      auditTrail([report(1n, 101n, 1n)]);

      await expect(asMe(REPORTED_GUEST)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('leaves every other photo available to both of them', async () => {
      auditTrail([report(1n, 1n, 101n)]);

      await expect(asMe(OTHER_GUEST)).resolves.toBeDefined();
      await expect(asMe(OTHER_COORDINATOR)).resolves.toBeDefined();
      await expect(asMe(MINE)).resolves.toBeDefined();
    });

    it('does not affect a third person, who can still fetch the photo', async () => {
      // The viewer (user 1) is not part of the report between 300 and 101.
      auditTrail([report(1n, 300n, 101n)]);

      await expect(asMe(REPORTED_GUEST)).resolves.toMatchObject({
        image_id: REPORTED_GUEST,
      });
    });

    it('serves the photo again once the report is dismissed', async () => {
      auditTrail([report(1n, 1n, 101n)], { resolved: ['1'] });

      await expect(asMe(REPORTED_GUEST)).resolves.toBeDefined();
    });
  });

  describe('a person on hold', () => {
    it('is hidden from everyone once two different people have reported them', async () => {
      auditTrail([report(1n, 300n, 101n), report(2n, 301n, 101n)]);

      await expect(asMe(REPORTED_GUEST)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is hidden when the held person is a coordinator', async () => {
      auditTrail([report(1n, 300n, 102n), report(2n, 301n, 102n)]);

      await expect(asMe(REPORTED_COORDINATOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is hidden when an administrator holds them', async () => {
      auditTrail([report(1n, 300n, 101n)], { held: [101n] });

      await expect(asMe(REPORTED_GUEST)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('still gets their own photo', async () => {
      auditTrail([report(1n, 300n, 101n), report(2n, 301n, 101n)]);

      await expect(
        service.getVisibleTo(REPORTED_GUEST, 'auth0|reported-g'),
      ).resolves.toMatchObject({ image_id: REPORTED_GUEST });
    });

    it('is served again when a dismissal takes the reports under the threshold', async () => {
      auditTrail([report(1n, 300n, 101n), report(2n, 301n, 101n)], {
        resolved: ['1'],
      });

      await expect(asMe(REPORTED_GUEST)).resolves.toBeDefined();
    });

    it('answers a held person’s photo exactly as it answers one that does not exist', async () => {
      auditTrail([report(1n, 300n, 101n), report(2n, 301n, 101n)]);

      const hidden = await asMe(REPORTED_GUEST).catch((e: unknown) => e);
      const missing = await asMe(UNKNOWN).catch((e: unknown) => e);

      expect((hidden as NotFoundException).getResponse()).toEqual(
        (missing as NotFoundException).getResponse(),
      );
    });
  });
});
