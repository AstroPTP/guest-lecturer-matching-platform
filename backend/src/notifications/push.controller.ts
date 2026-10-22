import { Body, Controller, Delete, Get, Headers, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';
import {
  publicKeyStatus,
  removeSubscription,
  saveSubscription,
  sendTest,
} from './push';

/**
 * Sets up and tests pushed notifications for the signed-in person. Open to
 * every signed-in user, and each route acts only on that user's own devices.
 */
@Controller('notifications/push')
export class PushController {
  /** Whether push is on, and the public key a browser subscribes with. */
  @Get('key')
  key() {
    return publicKeyStatus();
  }

  @Post('subscribe')
  subscribe(
    @Body() dto: SubscribePushDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('user-agent') userAgent?: string,
  ) {
    return saveSubscription(
      user.id,
      {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      userAgent,
    );
  }

  @Delete('subscribe')
  unsubscribe(
    @Body() dto: UnsubscribePushDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return removeSubscription(user.id, dto.endpoint);
  }

  // Limited to three a minute per person inside sendTest, not here: the request
  // throttler runs before sign-in is checked, so it can only count by address.
  @Post('test')
  test(@CurrentUser() user: AuthenticatedUser) {
    return sendTest(user.id);
  }
}
