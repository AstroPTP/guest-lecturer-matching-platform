import { Controller, Get, Patch, Body} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { GuestSpeakersService } from './guest-speakers.service';
import { BasicInformationDto } from './dto/basic-information.dto';
import { ExpertiseDto } from './dto/expertise.dto';
import { EngagementDto } from './dto/engagement.dto';
import { ConsentDto } from './dto/consent.dto';

@Controller('guest-speakers')
export class GuestSpeakersController {
  constructor(private readonly guestSpeakersService: GuestSpeakersService) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.findByUserId(user.id);
  }

  @Patch('me/basic-information')
  saveBasicInformation(@Body() dto: BasicInformationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.saveBasicInformation(user.id, dto);
  }

  @Patch('me/expertise')
  saveExpertise(@Body() dto: ExpertiseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.saveExpertise(user.id, dto);
  }

  @Patch('me/engagement')
  saveEngagement(@Body() dto: EngagementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.saveEngagement(user.id, dto);
  }

  @Patch('me/consent')
  saveConsent(@Body() dto: ConsentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guestSpeakersService.saveConsent(user.id, dto);
  }

  @Get()
  findAll() {
    return this.guestSpeakersService.findAll();
  }
}
