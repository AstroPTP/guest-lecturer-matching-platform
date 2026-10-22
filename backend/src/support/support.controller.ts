import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { downloadHeaders, MAX_ATTACHMENT_BYTES } from './attachments';
import { UserSupportMessageDto } from './dto/user-support-message.dto';
import { SupportService } from './support.service';

/**
 * Multer stops reading once the limit is hit, so an oversized file is refused
 * while streaming instead of being buffered in full first. One file, and a
 * small allowance for the text field beside it.
 *
 * The parser treats a file that reaches the limit as over it, so the limit is
 * one byte past 5MB for a file of exactly 5MB to be accepted.
 */
const attachmentUpload = FileInterceptor('attachment', {
  limits: {
    fileSize: MAX_ATTACHMENT_BYTES + 1,
    files: 1,
    fields: 2,
    fieldSize: 16_384,
  },
});

/**
 * The signed-in user's side of requests for details. Open to any signed-in
 * user, with or without a lecturer or coordinator profile; what they can reach
 * is limited to requests addressed to them.
 */
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('threads')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.support.listMine(user.id);
  }

  @Get('threads/:id')
  one(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.getMine(user.id, id);
  }

  // Each upload is up to 5MB written to the database, so this route has a
  // tighter limit than the API-wide one.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('threads/:id/messages')
  @UseInterceptors(attachmentUpload)
  reply(
    @Param('id') id: string,
    @Body() dto: UserSupportMessageDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.postMine(user.id, id, dto.content, file);
  }

  @Patch('threads/:id/read')
  read(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.markRead(user.id, id);
  }

  /**
   * The file itself. Served to the user it belongs to and to administrators,
   * and to nobody else. Images may display in the page; a PDF is always a
   * download, and nosniff stops a browser second-guessing the type.
   */
  @Get('attachments/:id')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const attachment = await this.support.getAttachment(user, id);
    res.set(downloadHeaders(attachment));
    res.send(Buffer.from(attachment.data));
  }
}
