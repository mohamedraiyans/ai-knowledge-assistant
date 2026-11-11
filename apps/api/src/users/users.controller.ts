import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AllowedEmailSummary, UserSummary } from '@slm/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestUser } from '../auth/types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): Promise<UserSummary[]> {
    return this.usersService.findAll();
  }

  // Declared before ':id' routes so "invites" is never read as a user id.
  @Get('invites')
  listInvites(): Promise<AllowedEmailSummary[]> {
    return this.usersService.listInvites();
  }

  @Post('invites')
  invite(
    @Body() body: { email?: unknown; role?: unknown },
    @CurrentUser() user: RequestUser,
  ): Promise<AllowedEmailSummary> {
    return this.usersService.invite(body?.email, body?.role, user.id);
  }

  @Delete('invites/:email')
  async revokeInvite(@Param('email') email: string): Promise<{ ok: true }> {
    await this.usersService.revokeInvite(email);
    return { ok: true };
  }

  @Patch(':id/role')
  setRole(@Param('id') id: string, @Body() body: { role?: unknown }): Promise<UserSummary> {
    return this.usersService.setRole(id, body?.role);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    await this.usersService.remove(id, user.id);
    return { ok: true };
  }
}
