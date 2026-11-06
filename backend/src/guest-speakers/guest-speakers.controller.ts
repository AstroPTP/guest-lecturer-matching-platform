import { Controller, Get, Patch, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import { DiscoveryQueryDto } from '../suggestions/dto/discovery-query.dto';

/**
 * Saving a profile is limited to the guest speaker role, so a coordinator or
 * administrator cannot create a guest profile. Reading your own profile stays
 * open to any signed-in role, and the Discovery list is for the other side only:
 * unit coordinators browse guest speakers.
 */
@Controller('guest-speakers')
export class GuestSpeakersController {
  constructor(private readonly guestSpeakersService: GuestSpeakersService) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.findByUserId(user.id);
  }

  @Patch('me/basic-information')
  @Roles(AppRole.GuestSpeaker)
  saveBasicInformation(
    @Body() dto: BasicInformationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestSpeakersService.saveBasicInformation(user.id, dto);
  }

  @Patch('me/expertise')
  @Roles(AppRole.GuestSpeaker)
  saveExpertise(
    @Body() dto: ExpertiseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestSpeakersService.saveExpertise(user.id, dto);
  }

  @Patch('me/engagement')
  @Roles(AppRole.GuestSpeaker)
  saveEngagement(
    @Body() dto: EngagementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestSpeakersService.saveEngagement(user.id, dto);
  }

  @Patch('me/consent')
  @Roles(AppRole.GuestSpeaker)
  saveConsent(@Body() dto: ConsentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.saveConsent(user.id, dto);
  }

  /**
   * The Discovery list, for unit coordinators. `?sort=` is optional and one of
   * joined, newest, name, topics, active or best; anything else is a 400.
   * `?forMatches=true` lists the caller's matched profiles instead of
   * Discovery's.
   */
  @Get()
  @Roles(AppRole.UnitCoordinator)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DiscoveryQueryDto = {},
  ) {
    return this.guestSpeakersService.findAll(
      user.id,
      query.sort,
      query.forMatches === 'true',
    );
  }
}
