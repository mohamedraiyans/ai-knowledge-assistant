import { Injectable, NotFoundException } from '@nestjs/common';
import type { FeatureKey, FeatureState } from '@slm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_REGISTRY, isFeatureKey } from './feature-registry';

/** Flags are read on every chat request, so reads share one short-lived snapshot. */
const CACHE_TTL_MS = 5_000;

@Injectable()
export class FeaturesService {
  private snapshot: { at: number; overrides: Map<string, boolean> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async overrides(): Promise<Map<string, boolean>> {
    if (this.snapshot && Date.now() - this.snapshot.at < CACHE_TTL_MS) {
      return this.snapshot.overrides;
    }
    const rows = await this.prisma.featureFlag.findMany();
    const overrides = new Map(rows.map((row) => [row.key, row.enabled]));
    this.snapshot = { at: Date.now(), overrides };
    return overrides;
  }

  async isEnabled(key: FeatureKey): Promise<boolean> {
    const overrides = await this.overrides();
    return overrides.get(key) ?? FEATURE_REGISTRY[key].defaultEnabled;
  }

  async list(): Promise<FeatureState[]> {
    const overrides = await this.overrides();

    return (Object.keys(FEATURE_REGISTRY) as FeatureKey[]).map((key) => {
      const { label, description, defaultEnabled } = FEATURE_REGISTRY[key];
      return {
        key,
        label,
        description,
        enabled: overrides.get(key) ?? defaultEnabled,
      };
    });
  }

  async setEnabled(
    key: string,
    enabled: boolean,
    userId: string,
  ): Promise<FeatureState> {
    if (!isFeatureKey(key))
      throw new NotFoundException(`Unknown feature "${key}"`);

    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, updatedBy: userId },
      update: { enabled, updatedBy: userId },
    });
    this.snapshot = null;
    const { label, description } = FEATURE_REGISTRY[key];
    return { key, label, description, enabled };
  }
}
