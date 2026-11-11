import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { PublicSettings, SettingsPayload } from '@slm/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** No auth: the login page needs the app name and colour before anyone signs in. */
  @Get('public')
  publicSettings(): Promise<PublicSettings> {
    return this.settings.publicSettings();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  payload(): Promise<SettingsPayload> {
    return this.settings.payload();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Put()
  update(
    @Body() body: { values?: Record<string, unknown> },
    @CurrentUser() user: RequestUser,
  ): Promise<SettingsPayload> {
    if (!body?.values || typeof body.values !== 'object') {
      throw new BadRequestException('"values" must be an object');
    }
    return this.settings.update(body.values, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':key')
  reset(@Param('key') key: string): Promise<SettingsPayload> {
    return this.settings.reset(key);
  }
}
