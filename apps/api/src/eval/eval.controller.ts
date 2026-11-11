import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  EvalCaseSummary,
  EvalRunSummary,
  ProviderName,
} from '@slm/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types';
import { EvalService } from './eval.service';

@Controller('eval')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('cases')
  cases(): Promise<EvalCaseSummary[]> {
    return this.evalService.listCases();
  }

  @Post('cases')
  addCase(@Body() body: { question?: unknown; expected?: unknown }): Promise<EvalCaseSummary> {
    return this.evalService.addCase(body?.question, body?.expected);
  }

  @Delete('cases/:id')
  async removeCase(@Param('id') id: string): Promise<{ ok: true }> {
    await this.evalService.removeCase(id);
    return { ok: true };
  }

  @Get('runs')
  runs(): Promise<EvalRunSummary[]> {
    return this.evalService.listRuns();
  }

  @Post('run')
  run(
    @Body() body: { provider: ProviderName },
    @CurrentUser() user: RequestUser,
  ): Promise<EvalRunSummary> {
    return this.evalService.run(body.provider, user.id);
  }
}
