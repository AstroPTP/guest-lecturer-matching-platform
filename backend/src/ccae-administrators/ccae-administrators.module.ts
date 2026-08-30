import { Module } from '@nestjs/common';
import { CcaeAdministratorsController } from './ccae-administrators.controller';
import { CcaeAdministratorsService } from './ccae-administrators.service';

@Module({
  controllers: [CcaeAdministratorsController],
  providers: [CcaeAdministratorsService],
})
export class CcaeAdministratorsModule {}