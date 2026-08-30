import { Module } from '@nestjs/common';
import { UnitCoordinatorsController } from './unit-coordinators.controller';
import { UnitCoordinatorsService } from './unit-coordinators.service';

@Module({
  controllers: [UnitCoordinatorsController],
  providers: [UnitCoordinatorsService]
})
export class UnitCoordinatorsModule {}