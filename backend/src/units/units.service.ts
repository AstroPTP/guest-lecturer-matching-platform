import { Injectable } from '@nestjs/common';
import { CreateUnitDto } from './dto/create-unit.dto';

export interface Unit extends CreateUnitDto {
  unitId: string;
}

@Injectable()
export class UnitsService {
  private units: Unit[] = [];

  create(createUnitDto: CreateUnitDto) {
    const newUnit: Unit = {
      unitId: crypto.randomUUID(),
      ...createUnitDto,
    };
    this.units.push(newUnit);
    return newUnit;
  }

  findAll() {
    return this.units;
  }
}
