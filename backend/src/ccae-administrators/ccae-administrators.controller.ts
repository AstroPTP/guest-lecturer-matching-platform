import { Controller, Post, Get, Body } from '@nestjs/common';
import { CcaeAdministratorsService } from './ccae-administrators.service';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';
import { AppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';

/**
 * Administrator records. The class-level @Roles applies to every route, so a
 * route added here later is closed to everyone but an administrator too.
 */
@Controller('ccae-administrators')
@Roles(AppRole.CcaeAdmin)
export class CcaeAdministratorsController {
  constructor(
    private readonly ccaeAdministratorsService: CcaeAdministratorsService,
  ) {}

  @Post()
  create(@Body() createCcaeAdministratorDto: CreateCcaeAdministratorDto) {
    return this.ccaeAdministratorsService.create(createCcaeAdministratorDto);
  }

  @Get()
  findAll() {
    return this.ccaeAdministratorsService.findAll();
  }
}
