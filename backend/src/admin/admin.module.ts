import { Module } from '@nestjs/common';
import { MatchRequestsModule } from '../match-requests/match-requests.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
import { ModerationController } from './moderation.controller';
import { SystemService } from './system.service';

@Module({
  imports: [MatchRequestsModule],
  controllers: [AdminController, ModerationController],
  providers: [AdminService, GovernanceService, SystemService],
})
export class AdminModule {}
