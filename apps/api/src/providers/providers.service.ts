import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderCredentialPublic, ProviderName } from '@slm/shared-types';
import { FaqService } from '../faq/faq.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

const VALID_PROVIDERS: ProviderName[] = ['GROQ', 'AZURE_OPENAI', 'ANTHROPIC'];

// The only non-secret settings a provider reads. Anything else an admin (or a stray
// client) sends is dropped rather than stored, so extraConfig can never become a place
// to stash arbitrary data or a second copy of a secret.
const EXTRA_CONFIG_KEYS = ['model', 'instanceName', 'deploymentName', 'apiVersion'] as const;

function sanitizeExtraConfig(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const clean: Record<string, string> = {};
  for (const key of EXTRA_CONFIG_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) clean[key] = value.trim();
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export interface UpdateProviderCredentialInput {
  label?: string;
  isActive?: boolean;
  extraConfig?: Record<string, unknown>;
}

export interface CreateProviderCredentialInput {
  provider: ProviderName;
  label: string;
  value: string;
  extraConfig?: Record<string, unknown>;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly faq: FaqService,
  ) {}

  async create(input: CreateProviderCredentialInput, createdBy: string): Promise<ProviderCredentialPublic> {
    if (!VALID_PROVIDERS.includes(input.provider)) {
      throw new BadRequestException(`Unknown provider "${input.provider}"`);
    }
    if (!input.label?.trim() || !input.value?.trim()) {
      throw new BadRequestException('label and value are required');
    }

    const credential = await this.prisma.providerCredential.create({
      data: {
        provider: input.provider,
        label: input.label.trim(),
        encryptedValue: this.encryption.encrypt(input.value),
        extraConfig: sanitizeExtraConfig(input.extraConfig) as never,
        createdBy,
      },
    });
    return this.toPublic(credential);
  }

  async findAll(): Promise<ProviderCredentialPublic[]> {
    const credentials = await this.prisma.providerCredential.findMany({ orderBy: { createdAt: 'desc' } });
    return credentials.map((credential) => this.toPublic(credential));
  }

  async findActiveProviderNames(): Promise<ProviderName[]> {
    const credentials = await this.prisma.providerCredential.findMany({
      where: { isActive: true },
      select: { provider: true },
      distinct: ['provider'],
    });
    return credentials.map((c) => c.provider as ProviderName);
  }

  /** Changes the label, the model/deployment, or switches a key on or off, without re-entering the key. */
  async update(id: string, input: UpdateProviderCredentialInput): Promise<ProviderCredentialPublic> {
    const existing = await this.prisma.providerCredential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider key not found');

    if (input.label !== undefined && !input.label.trim()) {
      throw new BadRequestException('label cannot be empty');
    }
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be true or false');
    }

    const updated = await this.prisma.providerCredential.update({
      where: { id },
      data: {
        label: input.label?.trim(),
        isActive: input.isActive,
        extraConfig:
          input.extraConfig === undefined
            ? undefined
            : ((sanitizeExtraConfig(input.extraConfig) ?? {}) as never),
      },
    });
    // A different model (or switching a key on or off) changes which answers users get,
    // so answers cached under the old setup are cleared.
    if (input.extraConfig !== undefined || input.isActive !== undefined) {
      await this.faq.invalidateAll();
    }
    return this.toPublic(updated);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.providerCredential.delete({ where: { id } });
  }

  async getDecryptedActiveCredential(
    provider: ProviderName,
  ): Promise<{ apiKey: string; extraConfig: Record<string, unknown> | null } | null> {
    const credential = await this.prisma.providerCredential.findFirst({
      where: { provider, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!credential) return null;
    return {
      apiKey: this.encryption.decrypt(credential.encryptedValue),
      extraConfig: (credential.extraConfig as Record<string, unknown> | null) ?? null,
    };
  }

  private toPublic(credential: {
    id: string;
    provider: string;
    label: string;
    isActive: boolean;
    extraConfig: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): ProviderCredentialPublic {
    return {
      id: credential.id,
      provider: credential.provider as ProviderName,
      label: credential.label,
      isActive: credential.isActive,
      extraConfig: (credential.extraConfig as Record<string, unknown> | null) ?? null,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }
}
