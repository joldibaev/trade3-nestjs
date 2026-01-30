import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DashboardStats } from './interfaces/statistics.interface';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  getDashboardStats(): Promise<DashboardStats> {
    return this.statisticsService.getDashboardStats();
  }
}
