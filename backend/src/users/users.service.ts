import { Injectable } from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';

import { prisma } from '../prisma';

export interface User extends CreateUserProfileDto {
  uuid: string;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  private users: User[] = [];

  create(createUserProfileDto: CreateUserProfileDto) {
    const newUser: User = {
      uuid: crypto.randomUUID(),
      createdAt: new Date(),
      ...createUserProfileDto,
    };
    this.users.push(newUser);
    return newUser;
  }

  findAll() {
    return this.users;
  }

  private async createUserInDatabase(userDTO: User)
  {
    const newUser = await prisma.user.create({
            data: {
                userid: userDTO.uuid,
                userauthid: userDTO.auth0Id,
                email: userDTO.email, 
                role: userDTO.role, 
                createdat: userDTO.createdAt
            },
        });
  }
}
