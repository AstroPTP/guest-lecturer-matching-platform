import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GovernanceService } from './governance.service';
import { ModerationController } from './moderation.controller';

@Module({
  controllers: [AdminController, ModerationController],
  providers: [AdminService, GovernanceService],
})
export class AdminModule {}
