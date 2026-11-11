import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { User } from '../../generated/prisma/client';

const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  private adminEmails(): string[] {
    return (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Signs a returning user in, or decides whether a new Google account is let in. Returns
   * null when it isn't, so the caller can send them back to the login page with a reason.
   *
   * A new account is admitted when any of these hold, checked in this order:
   *   1. its email is in ADMIN_EMAILS (admin)
   *   2. nobody has signed up yet: the first person to arrive becomes the admin, the way
   *      a fresh WordPress install works, so no one has to edit configuration first
   *   3. an admin invited that email (gets the invited role)
   *   4. the admin setting auth.registration is "open" (user)
   */
  async upsertFromGoogleProfile(profile: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }): Promise<User | null> {
    const email = profile.email.toLowerCase();
    const isAdminEmail = this.adminEmails().includes(email);
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          role: isAdminEmail && existing.role !== 'ADMIN' ? 'ADMIN' : existing.role,
        },
      });
    }

    const role = await this.roleForNewAccount(email, isAdminEmail);
    if (!role) return null;

    const user = await this.prisma.user.create({
      data: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl, role },
    });
    // The invite has done its job; the user row is the record from here on.
    await this.prisma.allowedEmail.deleteMany({ where: { email } });
    return user;
  }

  private async roleForNewAccount(
    email: string,
    isAdminEmail: boolean,
  ): Promise<'ADMIN' | 'USER' | null> {
    if (isAdminEmail) return 'ADMIN';
    if ((await this.prisma.user.count()) === 0) return 'ADMIN';

    const invite = await this.prisma.allowedEmail.findUnique({ where: { email } });
    if (invite) return invite.role;

    return (await this.settings.getString('auth.registration')) === 'open' ? 'USER' : null;
  }

  generateAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(raw), expiresAt },
    });
    return raw;
  }

  async issueTokenPair(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: await this.generateRefreshToken(user.id),
    };
  }

  async rotateRefreshToken(raw: string): Promise<{ user: User; refreshToken: string }> {
    const tokenHash = this.hashToken(raw);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return { user: record.user, refreshToken: await this.generateRefreshToken(record.userId) };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
