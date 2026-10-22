import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as prismaModule from '../prisma';
import { prisma } from '../prisma';
import {
  ImagesService,
  MAX_IMAGE_SIZE_BYTES,
  profileImageUrl,
} from './images.service';

/**
 * Profile photos are the one place the API accepts a file from a user, so the
 * tests pin what is allowed in (real JPEG, PNG and WebP content under 5MB),
 * that a photo can only be attached to the caller's own profile, and that a
 * failed save never leaves a stray or missing image behind.
 */

type Owner = 'coordinator' | 'guest';
type ImageRow = {
  image_id: bigint;
  image_data: Uint8Array;
  mime_type: string;
  filename: string;
};
type Tables = {
  images: Map<bigint, ImageRow>;
  coordinators: Map<bigint, bigint | null>;
  guests: Map<bigint, bigint | null>;
};
type ProfileTable = 'coordinators' | 'guests';

/**
 * The images table and the two profile tables that point at it, in memory.
 * Writes only work through a transaction, and a transaction that throws
 * leaves the tables as they were, so a test can tell whether the service did
 * all of its work inside one.
 */
class ImageTables {
  committed: Tables = {
    images: new Map(),
    coordinators: new Map(),
    guests: new Map(),
  };
  failProfileUpdate = false;
  private nextImageId = 100n;
  private saved: Array<[string, unknown]> = [];
  private readonly db = prisma as unknown as Record<string, unknown>;

  addProfile(owner: Owner, userId: bigint, imageId: bigint | null = null) {
    const table = owner === 'coordinator' ? 'coordinators' : 'guests';
    this.committed[table].set(userId, imageId);
    if (imageId !== null) {
      this.committed.images.set(imageId, {
        image_id: imageId,
        image_data: new Uint8Array([1]),
        mime_type: 'image/png',
        filename: `old-${imageId}.png`,
      });
    }
  }

  imageIds() {
    return [...this.committed.images.keys()];
  }

  photoOf(owner: Owner, userId: bigint) {
    const table = owner === 'coordinator' ? 'coordinators' : 'guests';
    return this.committed[table].get(userId);
  }

  install() {
    const keys = ['images', 'coordinators', 'guests', '$transaction'];
    this.saved = keys.map((key) => [key, this.db[key]]);
    const root = () => this.committed;
    this.db.images = this.images(root, false);
    this.db.coordinators = this.profiles('coordinators', root, false);
    this.db.guests = this.profiles('guests', root, false);
    this.db.$transaction = async <T>(work: (tx: unknown) => Promise<T>) => {
      const draft: Tables = {
        images: new Map(this.committed.images),
        coordinators: new Map(this.committed.coordinators),
        guests: new Map(this.committed.guests),
      };
      const tx = {
        images: this.images(() => draft, true),
        coordinators: this.profiles('coordinators', () => draft, true),
        guests: this.profiles('guests', () => draft, true),
      };
      const result = await work(tx);
      this.committed = draft;
      return result;
    };
  }

  uninstall() {
    for (const [key, value] of this.saved) {
      if (value === undefined) delete this.db[key];
      else this.db[key] = value;
    }
  }

  private images(read: () => Tables, writable: boolean) {
    const guard = () => {
      if (!writable) throw new Error('write outside a transaction');
    };
    return {
      findUnique: ({ where }: { where: { image_id: bigint } }) =>
        Promise.resolve(read().images.get(where.image_id) ?? null),
      create: ({ data }: { data: Omit<ImageRow, 'image_id'> }) => {
        guard();
        const row = { image_id: this.nextImageId++, ...data };
        read().images.set(row.image_id, row);
        return Promise.resolve(row);
      },
      delete: ({ where }: { where: { image_id: bigint } }) => {
        guard();
        if (!read().images.delete(where.image_id)) {
          return Promise.reject(new Error('image not found'));
        }
        return Promise.resolve({});
      },
    };
  }

  private profiles(name: ProfileTable, read: () => Tables, writable: boolean) {
    return {
      findUnique: ({ where }: { where: { user_id: bigint } }) => {
        const table = read()[name];
        return Promise.resolve(
          table.has(where.user_id)
            ? { profile_image_id: table.get(where.user_id) }
            : null,
        );
      },
      update: ({
        where,
        data,
      }: {
        where: { user_id: bigint };
        data: { profile_image_id: bigint | null };
      }) => {
        if (!writable) throw new Error('write outside a transaction');
        if (this.failProfileUpdate) {
          return Promise.reject(new Error('connection lost'));
        }
        const table = read()[name];
        if (!table.has(where.user_id)) {
          return Promise.reject(new Error('profile not found'));
        }
        table.set(where.user_id, data.profile_image_id);
        return Promise.resolve({});
      },
    };
  }
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEAD = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];
const WAVE_HEAD = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')];

function upload(
  mimetype: string,
  bytes: number[],
  originalname = 'me.png',
  size?: number,
): Express.Multer.File {
  const buffer = Buffer.from(bytes);
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    buffer,
    size: size ?? buffer.length,
  } as Express.Multer.File;
}

const png = () => upload('image/png', PNG_HEAD);

const USERS: Record<string, bigint> = { 'auth0|ann': 1n, 'auth0|ben': 2n };

describe('ImagesService', () => {
  const service = new ImagesService();
  let tables: ImageTables;
  let resolveUserId: jest.SpyInstance;

  beforeEach(() => {
    tables = new ImageTables();
    tables.install();
    resolveUserId = jest
      .spyOn(prismaModule, 'resolveUserId')
      .mockImplementation((sub: string) => Promise.resolve(USERS[sub]));
  });

  afterEach(() => {
    tables.uninstall();
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('returns the stored bytes and content type', async () => {
      tables.committed.images.set(7n, {
        image_id: 7n,
        image_data: new Uint8Array([9, 8, 7]),
        mime_type: 'image/webp',
        filename: 'a.webp',
      });

      const image = await service.get(7n);

      expect(image.mime_type).toBe('image/webp');
      expect([...image.image_data]).toEqual([9, 8, 7]);
    });

    it('answers not found for an image that does not exist', async () => {
      await expect(service.get(404n)).rejects.toThrow(
        new NotFoundException('Image not found'),
      );
    });
  });

  describe('replaceProfileImage validation', () => {
    it('refuses a missing or unsupported file before looking anyone up', async () => {
      const files = [
        undefined as unknown as Express.Multer.File,
        upload('image/gif', []),
      ];
      const upsert = jest.spyOn(prisma.users, 'upsert');

      for (const file of files) {
        await expect(
          service.replaceProfileImage('guest', 'auth0|new', file),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      expect(resolveUserId).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('refuses content types other than JPEG, PNG and WebP', async () => {
      tables.addProfile('guest', 1n);
      for (const type of ['image/gif', 'image/svg+xml', 'text/html']) {
        await expect(
          service.replaceProfileImage(
            'guest',
            'auth0|ann',
            upload(type, PNG_HEAD),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(tables.imageIds()).toEqual([]);
    });

    it('refuses content that is not what its label claims', async () => {
      tables.addProfile('guest', 1n);
      const mislabelled = [
        upload('image/png', [...Buffer.from('<script>')]),
        upload('image/jpeg', PNG_HEAD),
        upload('image/webp', WAVE_HEAD),
        upload('image/png', PNG_HEAD.slice(0, 7)),
      ];

      for (const file of mislabelled) {
        await expect(
          service.replaceProfileImage('guest', 'auth0|ann', file),
        ).rejects.toThrow('Unsupported image type');
      }
      expect(tables.imageIds()).toEqual([]);
    });

    it('accepts genuine JPEG, PNG and WebP content', async () => {
      tables.addProfile('guest', 1n);
      const genuine = [
        upload('image/jpeg', JPEG_HEAD),
        upload('image/png', PNG_HEAD),
        upload('image/webp', WEBP_HEAD),
      ];

      for (const file of genuine) {
        await expect(
          service.replaceProfileImage('guest', 'auth0|ann', file),
        ).resolves.toHaveProperty('image_id');
      }
    });

    it('enforces the 5MB limit: one byte over is refused, exactly 5MB is accepted', async () => {
      tables.addProfile('guest', 1n);
      const sized = (size: number) =>
        upload('image/png', PNG_HEAD, 'photo.png', size);

      await expect(
        service.replaceProfileImage(
          'guest',
          'auth0|ann',
          sized(MAX_IMAGE_SIZE_BYTES + 1),
        ),
      ).rejects.toThrow(new BadRequestException('Image too large. Max 5MB.'));
      expect(tables.imageIds()).toEqual([]);

      await expect(
        service.replaceProfileImage(
          'guest',
          'auth0|ann',
          sized(MAX_IMAGE_SIZE_BYTES),
        ),
      ).resolves.toHaveProperty('image_id');
    });
  });

  describe('replaceProfileImage', () => {
    it('stores the bytes, content type and file name, and returns the id as text', async () => {
      tables.addProfile('guest', 1n);

      const result = await service.replaceProfileImage(
        'guest',
        'auth0|ann',
        upload('image/jpeg', JPEG_HEAD, 'photo.jpg'),
      );

      expect(result).toEqual({ image_id: '100' });
      const stored = tables.committed.images.get(100n);
      expect(stored?.mime_type).toBe('image/jpeg');
      expect(stored?.filename).toBe('photo.jpg');
      expect([...(stored?.image_data ?? [])]).toEqual(JPEG_HEAD);
    });

    it.each(['coordinator', 'guest'] as const)(
      'points the %s profile at the new image and leaves the other table alone',
      async (owner) => {
        const other: Owner = owner === 'guest' ? 'coordinator' : 'guest';
        tables.addProfile(owner, 1n);
        tables.addProfile(other, 1n);

        await service.replaceProfileImage(owner, 'auth0|ann', png());

        expect(tables.photoOf(owner, 1n)).toBe(100n);
        expect(tables.photoOf(other, 1n)).toBeNull();
      },
    );

    it("never changes another user's photo", async () => {
      tables.addProfile('guest', 1n, 10n);
      tables.addProfile('guest', 2n, 11n);

      await service.replaceProfileImage('guest', 'auth0|ann', png());

      expect(tables.photoOf('guest', 2n)).toBe(11n);
      expect(tables.committed.images.has(11n)).toBe(true);
    });

    it('deletes the photo it replaces so old pictures do not pile up', async () => {
      tables.addProfile('guest', 1n, 10n);

      await service.replaceProfileImage('guest', 'auth0|ann', png());

      expect(tables.photoOf('guest', 1n)).toBe(100n);
      expect(tables.imageIds()).toEqual([100n]);
    });

    it('asks the user to save their basic information first when there is no profile', async () => {
      await expect(
        service.replaceProfileImage('guest', 'auth0|ann', png()),
      ).rejects.toThrow(
        new NotFoundException(
          'Save your basic information before adding a photo.',
        ),
      );
      expect(tables.imageIds()).toEqual([]);
    });

    it('keeps the old photo and stores nothing new when linking the new one fails', async () => {
      tables.addProfile('guest', 1n, 10n);
      tables.failProfileUpdate = true;

      await expect(
        service.replaceProfileImage('guest', 'auth0|ann', png()),
      ).rejects.toThrow('connection lost');

      expect(tables.imageIds()).toEqual([10n]);
      expect(tables.photoOf('guest', 1n)).toBe(10n);
    });
  });

  describe('removeProfileImage', () => {
    it.each(['coordinator', 'guest'] as const)(
      'clears the %s photo and deletes the stored image',
      async (owner) => {
        tables.addProfile(owner, 1n, 10n);

        await expect(
          service.removeProfileImage(owner, 'auth0|ann'),
        ).resolves.toEqual({ success: true });

        expect(tables.photoOf(owner, 1n)).toBeNull();
        expect(tables.imageIds()).toEqual([]);
      },
    );

    it("leaves other users' photos in place", async () => {
      tables.addProfile('guest', 1n, 10n);
      tables.addProfile('guest', 2n, 11n);

      await service.removeProfileImage('guest', 'auth0|ann');

      expect(tables.photoOf('guest', 2n)).toBe(11n);
      expect(tables.imageIds()).toEqual([11n]);
    });

    it('succeeds quietly when there is no photo to remove', async () => {
      tables.addProfile('guest', 1n);
      await expect(
        service.removeProfileImage('guest', 'auth0|ann'),
      ).resolves.toEqual({ success: true });
    });

    it('answers not found when the caller has no profile', async () => {
      await expect(
        service.removeProfileImage('coordinator', 'auth0|ann'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps the image when clearing the link fails', async () => {
      tables.addProfile('guest', 1n, 10n);
      tables.failProfileUpdate = true;

      await expect(
        service.removeProfileImage('guest', 'auth0|ann'),
      ).rejects.toThrow('connection lost');

      expect(tables.photoOf('guest', 1n)).toBe(10n);
      expect(tables.imageIds()).toEqual([10n]);
    });
  });
});

describe('profileImageUrl', () => {
  it('is empty without a photo and points at the image route with one', () => {
    expect(profileImageUrl(null)).toBe('');
    expect(profileImageUrl(42n)).toBe('/api/backend/images/42');
  });
});
