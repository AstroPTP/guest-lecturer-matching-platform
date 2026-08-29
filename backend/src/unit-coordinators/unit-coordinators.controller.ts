import { Controller, Post, Get, Body } from '@nestjs/common';
import { UnitCoordinatorsService } from './unit-coordinators.service';
import { CreateUnitCoordinatorsDto } from './dto/create-unit-coordinators.dto';

@Controller('unit-coordinators')
export class UnitCoordinatorsController {
  constructor(private readonly unitCoordinatorsService: UnitCoordinatorsService) {}

  @Post()
  create(@Body() createUnitCoordinatorsDto: CreateUnitCoordinatorsDto) {
    return this.unitCoordinatorsService.create(createUnitCoordinatorsDto);
  }

  @Get()
  findAll() {
    return this.unitCoordinatorsService.findAll();
  }
}