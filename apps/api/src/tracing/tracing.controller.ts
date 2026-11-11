import { Controller, Get, UseGuards } from '@nestjs/common';
import type { UsageStats } from '@slm/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TracingService } from './tracing.service';

@Controller('tracing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TracingController {
  constructor(private readonly tracing: TracingService) {}

  @Get('usage')
  usage(): Promise<UsageStats> {
    return this.tracing.stats();
  }
}
