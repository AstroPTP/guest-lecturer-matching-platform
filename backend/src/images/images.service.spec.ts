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
const profile = (owner: Row | null, approved = true): Row => ({
  user_id: owner ? 1n : null,
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
