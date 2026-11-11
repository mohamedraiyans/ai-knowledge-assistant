import { BadRequestException, Injectable } from '@nestjs/common';
import type { PublicSettings, SettingsPayload } from '@slm/shared-types';
import { FaqService } from '../faq/faq.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  findSetting,
  SETTINGS_REGISTRY,
  validateSettingValue,
} from './settings-registry';

/** Settings are read on the chat hot path, so reads share one short-lived snapshot. */
const CACHE_TTL_MS = 5_000;

/**
 * Settings that change what an answer says. Cached answers were produced under the old
 * values, so changing any of these clears the answer cache; branding, chunking (new
 * uploads only), cache lifetime and sign-in rules do not affect existing answers.
 */
const ANSWER_AFFECTING_PREFIXES = ['chat.', 'retrieval.', 'graph.'];

const affectsAnswers = (key: string) =>
  ANSWER_AFFECTING_PREFIXES.some((prefix) => key.startsWith(prefix));

@Injectable()
export class SettingsService {
  private snapshot: {
    at: number;
    values: Record<string, string | number>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly faq: FaqService,
  ) {}

  async all(): Promise<Record<string, string | number>> {
    if (this.snapshot && Date.now() - this.snapshot.at < CACHE_TTL_MS) {
      return this.snapshot.values;
    }
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row.value]));

    const values: Record<string, string | number> = {};
    for (const def of SETTINGS_REGISTRY) {
      const override = stored.get(def.key);
      // A stored value that no longer validates (the registry changed) falls back to
      // the default rather than breaking every request that reads it.
      try {
        values[def.key] =
          override === undefined
            ? def.default
            : validateSettingValue(def, override);
      } catch {
        values[def.key] = def.default;
      }
    }
    this.snapshot = { at: Date.now(), values };
    return values;
  }

  async getString(key: string): Promise<string> {
    return String((await this.all())[key] ?? findSetting(key)?.default ?? '');
  }

  async getNumber(key: string): Promise<number> {
    const value = (await this.all())[key] ?? findSetting(key)?.default;
    return Number(value);
  }

  async payload(): Promise<SettingsPayload> {
    return { definitions: SETTINGS_REGISTRY, values: await this.all() };
  }

  async publicSettings(): Promise<PublicSettings> {
    const values = await this.all();
    return {
      appName: String(values['branding.appName']),
      tagline: String(values['branding.tagline']),
      primaryColor: String(values['branding.primaryColor']),
    };
  }

  /** Validates every field first so a bad value never leaves a half-applied update. */
  async update(
    changes: Record<string, unknown>,
    userId: string,
  ): Promise<SettingsPayload> {
    const entries = Object.entries(changes);
    if (entries.length === 0) throw new BadRequestException('Nothing to update');

    const validated = entries.map(([key, raw]) => {
      const def = findSetting(key);
      if (!def) throw new BadRequestException(`Unknown setting "${key}"`);
      return [key, validateSettingValue(def, raw)] as const;
    });

    await this.prisma.$transaction(
      validated.map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value, updatedBy: userId },
          update: { value, updatedBy: userId },
        }),
      ),
    );
    this.snapshot = null;
    if (validated.some(([key]) => affectsAnswers(key))) await this.faq.invalidateAll();
    return this.payload();
  }

  /** Puts one field back to its default by deleting the override. */
  async reset(key: string): Promise<SettingsPayload> {
    if (!findSetting(key)) {
      throw new BadRequestException(`Unknown setting "${key}"`);
    }
    await this.prisma.setting.deleteMany({ where: { key } });
    this.snapshot = null;
    if (affectsAnswers(key)) await this.faq.invalidateAll();
    return this.payload();
  }
}
