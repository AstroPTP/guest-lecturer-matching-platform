import { Controller, Get, Patch, Body } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { UnitCoordinatorsService } from './unit-coordinators.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

/**
 * Saving a profile is limited to the unit coordinator role, so a guest speaker
 * or administrator cannot create a coordinator profile. Reads stay open to any
 * signed-in role: guest speakers browse coordinators.
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

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.unitCoordinatorsService.findAll(user.id);
  }
}
