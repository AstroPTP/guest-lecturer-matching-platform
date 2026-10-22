import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
import { ModerationController } from './moderation.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [AdminController, ModerationController],
  providers: [AdminService, GovernanceService, SystemService],
})
export class AdminModule {}
