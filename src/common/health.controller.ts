import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from './decorators/public.decorator';

interface Status {
  status: string;
  timestamp: string;
}

@ApiTags('System')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check(): Status {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
