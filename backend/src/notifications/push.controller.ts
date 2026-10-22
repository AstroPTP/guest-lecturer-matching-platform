import { Body, Controller, Delete, Get, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
 * Counts test pushes against the signed-in person where the token has been
 * read, and against the address otherwise. Behind the web app's proxy every
 * person can arrive from the same address, which would make three a minute a
 * limit shared by everyone.
 */
function perPerson(request: { user?: { id?: unknown }; ip?: string }): string {
  const id = request.user?.id;
  return typeof id === 'string' ? `user:${id}` : (request.ip ?? 'unknown');
}

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

  // Each test reaches every device the person has, so it is limited tighter
  // than the API as a whole.
  @Throttle({ default: { limit: 3, ttl: 60_000, getTracker: perPerson } })
  @Post('test')
  test(@CurrentUser() user: AuthenticatedUser) {
    return sendTest(user.id);
  }
}
