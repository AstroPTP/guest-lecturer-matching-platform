import { Injectable } from '@nestjs/common';
import { CreateUnitCoordinatorsDto } from './dto/create-unit-coordinators.dto';

export interface UnitCoordinator extends CreateUnitCoordinatorsDto {
  coordinatorId: string;
}

@Injectable()
export class UnitCoordinatorsService {
  private coordinators: UnitCoordinator[] = [];

  create(createUnitCoordinatorsDto: CreateUnitCoordinatorsDto) {
    const newCoordinator: UnitCoordinator = {
      coordinatorId: crypto.randomUUID(),
      ...createUnitCoordinatorsDto,
    };
    this.coordinators.push(newCoordinator);
    return newCoordinator;
  }

  findAll() {
    return this.coordinators;
  }
}