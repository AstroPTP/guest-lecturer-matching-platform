import { Controller, Post, Get, Body } from '@nestjs/common';
import { CcaeAdministratorsService } from './ccae-administrators.service';
import { CreateCcaeAdministratorDto } from './dto/create-ccae-administrator.dto';

@Controller('ccae-administrators')
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
