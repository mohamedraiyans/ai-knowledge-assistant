import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ProviderCredentialPublic, ProviderName, ProviderUsageSnapshot } from '@slm/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types';
import { ProviderFactory } from '../chat/provider-factory.service';
import { ProviderUsageService } from './provider-usage.service';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly providerUsage: ProviderUsageService,
    private readonly providerFactory: ProviderFactory,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('available')
  availableProviders(): Promise<ProviderName[]> {
    return this.providersService.findActiveProviderNames();
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage')
  async usage(): Promise<ProviderUsageSnapshot[]> {
    const active = await this.providersService.findActiveProviderNames();
    return this.providerUsage.getMany(active);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll(): Promise<ProviderCredentialPublic[]> {
    return this.providersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(
    @Body()
    body: { provider: ProviderName; label: string; value: string; extraConfig?: Record<string, unknown> },
    @CurrentUser() user: RequestUser,
  ): Promise<ProviderCredentialPublic> {
    return this.providersService.create(body, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { label?: string; isActive?: boolean; extraConfig?: Record<string, unknown> },
  ): Promise<ProviderCredentialPublic> {
    return this.providersService.update(id, body ?? {});
  }

  /** Sends a one-line prompt through the active key so an admin can confirm it works. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('test')
  async test(
    @Body() body: { provider: ProviderName },
  ): Promise<{ ok: boolean; latencyMs: number; reply?: string; error?: string }> {
    const started = Date.now();
    try {
      const model = await this.providerFactory.build(body.provider, { maxTokens: 256, temperature: 0 });
      const reply = await model.invoke('Reply with the single word: ready');
      return { ok: true, latencyMs: Date.now() - started, reply: String(reply.content).trim().slice(0, 80) };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
      };
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.providersService.remove(id);
    return { ok: true };
  }
}
