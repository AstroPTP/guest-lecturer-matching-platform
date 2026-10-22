import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { toId } from '../prisma';
import { ImagesService, MAX_IMAGE_SIZE_BYTES } from './images.service';

/**
 * Multer stops reading once the limit is hit, so an oversized upload is
 * refused while streaming instead of being buffered in full first.
 */
const photoUpload = FileInterceptor('file', {
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
});

/**
 * Profile photo routes act on the caller's own profile only (`me`), so one
 * user can never replace another's photo, and each is limited to the role that
 * owns that kind of profile.
 */
@Controller()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  /** Serves raw image bytes. Used as the `src` of an <img> tag. */
  @Get('images/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const image = await this.images.get(toId(id, 'id'));
    res.setHeader('Content-Type', image.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(image.image_data);
  }

  @Post('unit-coordinators/me/profile-image')
  @Roles(AppRole.UnitCoordinator)
  @UseInterceptors(photoUpload)
  setCoordinatorImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.images.replaceProfileImage('coordinator', user.id, file);
  }

  @Delete('unit-coordinators/me/profile-image')
  @Roles(AppRole.UnitCoordinator)
  removeCoordinatorImage(@CurrentUser() user: AuthenticatedUser) {
    return this.images.removeProfileImage('coordinator', user.id);
  }

  @Post('guest-speakers/me/profile-image')
  @Roles(AppRole.GuestSpeaker)
  @UseInterceptors(photoUpload)
  setGuestImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.images.replaceProfileImage('guest', user.id, file);
  }

  @Delete('guest-speakers/me/profile-image')
  @Roles(AppRole.GuestSpeaker)
  removeGuestImage(@CurrentUser() user: AuthenticatedUser) {
    return this.images.removeProfileImage('guest', user.id);
  }
}
