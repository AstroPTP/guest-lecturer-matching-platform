import { Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(): string {
    return 'login endpoint hit';
  }
}