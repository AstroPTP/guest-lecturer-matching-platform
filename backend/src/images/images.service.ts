import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma, resolveUserId } from '../prisma';
import { visibleGuestsWhere } from '../admin/platform-rules';
import { visibleCoordinatorsWhere } from '../unit-coordinators/coordinator-visibility';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const MAX_IMAGE_ID = 2n ** 63n - 1n;

const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
};

type Owner = 'coordinator' | 'guest';

@Injectable()
export class ImagesService {
  /**
   * The image, but only to someone who may see it: the owner of the profile it
   * belongs to, or anyone signed in while that profile is listed on the
   * discovery pages.
   *
   * Every other case is reported as missing, the same as an id that does not
   * exist, so a caller cannot tell which ids are in use or whose photo a
   * deactivated or unapproved profile holds. The check is part of the query,
   * so the bytes are only read when the caller may have them.
   */
  async getVisibleTo(imageId: bigint, viewerAuth0Id: string) {
    // The column is a signed 64-bit integer; a larger number would make the
    // query itself fail with a server error instead of finding nothing.
    if (imageId < 1n || imageId > MAX_IMAGE_ID) {
      throw new NotFoundException('Image not found');
    }
    const ownProfile = { users: { is: { auth0Id: viewerAuth0Id } } };
    const image = await prisma.images.findFirst({
      where: {
        image_id: imageId,
        OR: [
          {
            guests: { some: { OR: [ownProfile, await visibleGuestsWhere()] } },
          },
          {
            coordinators: {
              some: { OR: [ownProfile, visibleCoordinatorsWhere] },
            },
          },
        ],
      },
    });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  async replaceProfileImage(
    owner: Owner,
    auth0Id: string,
    file: Express.Multer.File,
  ) {
    this.validate(file);
    const userId = await resolveUserId(auth0Id);
    const oldImageId = await this.currentImageId(owner, userId);

    const imageId = await prisma.$transaction(async (tx) => {
      const image = await tx.images.create({
        data: {
          image_data: new Uint8Array(file.buffer),
          mime_type: file.mimetype,
          filename: file.originalname,
        },
      });
      const data = { profile_image_id: image.image_id };
      if (owner === 'coordinator') {
        await tx.coordinators.update({ where: { user_id: userId }, data });
      } else {
        await tx.guests.update({ where: { user_id: userId }, data });
      }
      if (oldImageId) {
        await tx.images.delete({ where: { image_id: oldImageId } });
      }
      return image.image_id;
    });

    return { image_id: imageId.toString() };
  }

  async removeProfileImage(owner: Owner, auth0Id: string) {
    const userId = await resolveUserId(auth0Id);
    const oldImageId = await this.currentImageId(owner, userId);

    await prisma.$transaction(async (tx) => {
      const data = { profile_image_id: null };
      if (owner === 'coordinator') {
        await tx.coordinators.update({ where: { user_id: userId }, data });
      } else {
        await tx.guests.update({ where: { user_id: userId }, data });
      }
      if (oldImageId) {
        await tx.images.delete({ where: { image_id: oldImageId } });
      }
    });

    return { success: true };
  }

  private async currentImageId(owner: Owner, userId: bigint) {
    const row =
      owner === 'coordinator'
        ? await prisma.coordinators.findUnique({
            where: { user_id: userId },
            select: { profile_image_id: true },
          })
        : await prisma.guests.findUnique({
            where: { user_id: userId },
            select: { profile_image_id: true },
          });
    if (!row) {
      throw new NotFoundException(
        'Save your basic information before adding a photo.',
      );
    }
    return row.profile_image_id;
  }

  private validate(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const matches = SIGNATURES[file.mimetype];
    if (!matches || !matches(file.buffer)) {
      throw new BadRequestException(
        'Unsupported image type. Use JPEG, PNG or WebP.',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image too large. Max 5MB.');
    }
  }
}

export function profileImageUrl(imageId: bigint | null): string {
  return imageId === null ? '' : `/api/backend/images/${imageId}`;
}
