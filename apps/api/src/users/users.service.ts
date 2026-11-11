import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AllowedEmailSummary, Role, UserSummary } from '@slm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(value: unknown): value is Role {
  return value === 'ADMIN' || value === 'USER';
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  async remove(id: string, currentUserId: string): Promise<void> {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.prisma.user.delete({ where: { id } });
  }

  /** Promotes or demotes a user. The last admin can never be demoted, so the app cannot lock itself out. */
  async setRole(id: string, role: unknown): Promise<UserSummary> {
    if (!isRole(role)) throw new BadRequestException('Role must be ADMIN or USER');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'ADMIN' && role === 'USER') {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) throw new BadRequestException('There must be at least one admin');
    }

    const updated = await this.prisma.user.update({ where: { id }, data: { role } });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatarUrl,
      role: updated.role,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listInvites(): Promise<AllowedEmailSummary[]> {
    const invites = await this.prisma.allowedEmail.findMany({ orderBy: { createdAt: 'desc' } });
    return invites.map((invite) => ({
      email: invite.email,
      role: invite.role,
      createdAt: invite.createdAt.toISOString(),
    }));
  }

  async invite(email: unknown, role: unknown, invitedBy: string): Promise<AllowedEmailSummary> {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      throw new BadRequestException('Enter a valid email address');
    }
    const normalized = email.trim().toLowerCase();
    const chosenRole: Role = role === undefined ? 'USER' : isRole(role) ? role : 'USER';
    if (role !== undefined && !isRole(role)) {
      throw new BadRequestException('Role must be ADMIN or USER');
    }

    if (await this.prisma.user.findUnique({ where: { email: normalized } })) {
      throw new BadRequestException('That person already has an account');
    }

    const invite = await this.prisma.allowedEmail.upsert({
      where: { email: normalized },
      create: { email: normalized, role: chosenRole, invitedBy },
      update: { role: chosenRole, invitedBy },
    });
    return {
      email: invite.email,
      role: invite.role,
      createdAt: invite.createdAt.toISOString(),
    };
  }

  async revokeInvite(email: string): Promise<void> {
    await this.prisma.allowedEmail.deleteMany({ where: { email: email.trim().toLowerCase() } });
  }
}
