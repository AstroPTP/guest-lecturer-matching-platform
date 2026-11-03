import { Controller, Get, Patch, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { UnitCoordinatorsService } from './unit-coordinators.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';
import { DiscoveryQueryDto } from '../suggestions/dto/discovery-query.dto';

/**
 * Saving a profile is limited to the unit coordinator role, so a guest speaker
 * or administrator cannot create a coordinator profile. Reading your own
 * profile stays open to any signed-in role, and the Discovery list is for the
 * other side only: guest speakers browse coordinators.
 */
@Controller('unit-coordinators')
export class UnitCoordinatorsController {
  constructor(
    private readonly unitCoordinatorsService: UnitCoordinatorsService,
  ) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.unitCoordinatorsService.findByUserId(user.id);
  }

  @Patch('me/basic-information')
  @Roles(AppRole.UnitCoordinator)
  saveBasicInformation(
    @Body() dto: BasicInformationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.unitCoordinatorsService.saveBasicInformation(user.id, dto);
  }

  @Patch('me/expertise')
  @Roles(AppRole.UnitCoordinator)
  saveExpertise(
    @Body() dto: ExpertiseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.unitCoordinatorsService.saveExpertise(user.id, dto);
  }

  @Patch('me/engagement')
  @Roles(AppRole.UnitCoordinator)
  saveEngagement(
    @Body() dto: EngagementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.unitCoordinatorsService.saveEngagement(user.id, dto);
  }

  @Patch('me/consent')
  @Roles(AppRole.UnitCoordinator)
  saveConsent(@Body() dto: ConsentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.unitCoordinatorsService.saveConsent(user.id, dto);
  }

  /**
   * The Discovery list, for guest speakers. `?sort=` is optional and one of
   * joined, newest, name, topics, active or best; anything else is a 400.
   * `?forMatches=true` lists the caller's matched profiles instead of
   * Discovery's.
   */
  @Get()
  @Roles(AppRole.GuestSpeaker)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DiscoveryQueryDto = {},
  ) {
    return this.unitCoordinatorsService.findAll(
      user.id,
      query.sort,
      query.forMatches === 'true',
    );
  }
}
