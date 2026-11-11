import { BadRequestException } from '@nestjs/common';
import {
  findSetting,
  SETTINGS_REGISTRY,
  validateSettingValue,
} from './settings-registry';
import { SettingsService } from './settings.service';

// The generated Prisma client sits outside jest's rootDir; only the DI token is needed.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

function def(key: string) {
  const found = findSetting(key);
  if (!found) throw new Error(`no such setting ${key}`);
  return found;
}

function createService(rows: { key: string; value: unknown }[] = []) {
  const faq = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
  const table = new Map(rows.map((row) => [row.key, row.value]));
  const prisma = {
    setting: {
      findMany: jest.fn(() =>
        Promise.resolve([...table].map(([key, value]) => ({ key, value }))),
      ),
      upsert: jest.fn(({ where, update }: { where: { key: string }; update: { value: unknown } }) => {
        table.set(where.key, update.value);
        return Promise.resolve();
      }),
      deleteMany: jest.fn(({ where }: { where: { key: string } }) => {
        table.delete(where.key);
        return Promise.resolve();
      }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, faq, service: new SettingsService(prisma as never, faq as never) };
}

describe('settings registry', () => {
  it('has unique keys', () => {
    const keys = SETTINGS_REGISTRY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ships defaults that pass their own validation', () => {
    for (const setting of SETTINGS_REGISTRY) {
      expect(() => validateSettingValue(setting, setting.default)).not.toThrow();
    }
  });

  it('keeps the behaviour the code had before it became configurable', () => {
    expect(def('retrieval.topK').default).toBe(12);
    expect(def('retrieval.perFileCap').default).toBe(4);
    expect(def('chunking.targetWords').default).toBe(70);
    expect(def('chunking.overlapWords').default).toBe(20);
    expect(def('chat.temperature').default).toBe(0.3);
    expect(def('graph.hops').default).toBe(2);
    expect(def('cache.ttlDays').default).toBe(7);
  });

  it('is invite-only unless an admin opens registration', () => {
    expect(def('auth.registration').default).toBe('invite-only');
  });
});

describe('validateSettingValue', () => {
  it('trims text and refuses empty or over-long values', () => {
    expect(validateSettingValue(def('branding.appName'), '  Acme  ')).toBe('Acme');
    expect(() => validateSettingValue(def('branding.appName'), '   ')).toThrow(BadRequestException);
    expect(() => validateSettingValue(def('branding.appName'), 'x'.repeat(61))).toThrow(
      BadRequestException,
    );
  });

  it.each(['red', '#fff', '#12345g', 12, null])('rejects the colour %p', (value) => {
    expect(() => validateSettingValue(def('branding.primaryColor'), value)).toThrow(
      BadRequestException,
    );
  });

  it('lower-cases a valid colour', () => {
    expect(validateSettingValue(def('branding.primaryColor'), '#D8AA3E')).toBe('#d8aa3e');
  });

  it('enforces number ranges and whole numbers where the step is 1', () => {
    expect(validateSettingValue(def('retrieval.topK'), 8)).toBe(8);
    expect(validateSettingValue(def('retrieval.topK'), '8')).toBe(8);
    expect(() => validateSettingValue(def('retrieval.topK'), 0)).toThrow(BadRequestException);
    expect(() => validateSettingValue(def('retrieval.topK'), 31)).toThrow(BadRequestException);
    expect(() => validateSettingValue(def('retrieval.topK'), 2.5)).toThrow(BadRequestException);
    expect(() => validateSettingValue(def('retrieval.topK'), 'many')).toThrow(BadRequestException);
    expect(() => validateSettingValue(def('retrieval.topK'), NaN)).toThrow(BadRequestException);
  });

  it('allows fractions where the step is below 1', () => {
    expect(validateSettingValue(def('chat.temperature'), 0.7)).toBe(0.7);
    expect(() => validateSettingValue(def('chat.temperature'), 1.5)).toThrow(BadRequestException);
  });

  it('only accepts listed options', () => {
    expect(validateSettingValue(def('auth.registration'), 'open')).toBe('open');
    expect(() => validateSettingValue(def('auth.registration'), 'anyone')).toThrow(
      BadRequestException,
    );
  });

  it('names the field in the error so the admin knows what to fix', () => {
    expect(() => validateSettingValue(def('retrieval.topK'), 0)).toThrow(/Passages sent to the model/);
  });
});

describe('SettingsService', () => {
  it('returns the default for every setting when nothing is stored', async () => {
    const { service } = createService();
    const values = await service.all();
    for (const setting of SETTINGS_REGISTRY) {
      expect(values[setting.key]).toBe(setting.default);
    }
  });

  it('lets a stored override win over the default', async () => {
    const { service } = createService([{ key: 'retrieval.topK', value: 5 }]);
    await expect(service.getNumber('retrieval.topK')).resolves.toBe(5);
  });

  it('falls back to the default when a stored value no longer validates', async () => {
    const { service } = createService([{ key: 'retrieval.topK', value: 9999 }]);
    await expect(service.getNumber('retrieval.topK')).resolves.toBe(12);
  });

  it('applies an update on the very next read, not after the cache expires', async () => {
    const { service } = createService();
    await expect(service.getNumber('retrieval.topK')).resolves.toBe(12);

    await service.update({ 'retrieval.topK': 6 }, 'admin-1');

    await expect(service.getNumber('retrieval.topK')).resolves.toBe(6);
  });

  it('rejects an unknown key without writing anything', async () => {
    const { service, prisma } = createService();
    await expect(service.update({ 'nope.nothing': 1 }, 'admin-1')).rejects.toThrow(
      /Unknown setting/,
    );
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('writes nothing at all if any one value in the batch is invalid', async () => {
    const { service, prisma } = createService();
    await expect(
      service.update({ 'retrieval.topK': 6, 'chat.temperature': 5 }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it.each([['chat.systemPrompt', 'New prompt'], ['retrieval.topK', 5], ['graph.hops', 3]])(
    'clears cached answers when %s changes, since they were written under the old value',
    async (key, value) => {
      const { service, faq } = createService();
      await service.update({ [key]: value }, 'admin-1');
      expect(faq.invalidateAll).toHaveBeenCalledTimes(1);
    },
  );

  it.each([['branding.appName', 'Acme'], ['cache.ttlDays', 3], ['auth.registration', 'open']])(
    'leaves cached answers alone when %s changes, since it cannot alter an answer',
    async (key, value) => {
      const { service, faq } = createService();
      await service.update({ [key]: value }, 'admin-1');
      expect(faq.invalidateAll).not.toHaveBeenCalled();
    },
  );

  it('clears cached answers when an answer-affecting setting is reset', async () => {
    const { service, faq } = createService([{ key: 'chat.temperature', value: 0.9 }]);
    await service.reset('chat.temperature');
    expect(faq.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('does not clear the cache when a rejected update never wrote anything', async () => {
    const { service, faq } = createService();
    await expect(service.update({ 'retrieval.topK': 0 }, 'admin-1')).rejects.toThrow();
    expect(faq.invalidateAll).not.toHaveBeenCalled();
  });

  it('records which admin made the change', async () => {
    const { service, prisma } = createService();
    await service.update({ 'retrieval.topK': 6 }, 'admin-1');
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ updatedBy: 'admin-1' }) as unknown,
      }),
    );
  });

  it('puts a setting back to its default by deleting the override', async () => {
    const { service } = createService([{ key: 'retrieval.topK', value: 5 }]);
    await service.reset('retrieval.topK');
    await expect(service.getNumber('retrieval.topK')).resolves.toBe(12);
  });

  it('exposes only branding to unauthenticated visitors', async () => {
    const { service } = createService([{ key: 'branding.appName', value: 'Acme Brain' }]);
    const pub = await service.publicSettings();
    expect(Object.keys(pub).sort()).toEqual(['appName', 'primaryColor', 'tagline']);
    expect(pub.appName).toBe('Acme Brain');
  });
});
