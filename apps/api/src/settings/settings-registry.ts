import { BadRequestException } from '@nestjs/common';
import type { SettingDefinition } from '@slm/shared-types';

/**
 * Everything an admin can change without touching code. As with the feature flags,
 * the definitions live here and the database stores only overrides, so a typo'd key
 * fails to compile in callers and an unknown key is rejected on write.
 *
 * The default of every chat/retrieval/graph/cache value is what the code did before it
 * became configurable, so a fresh install behaves exactly as it always did.
 */
export const SETTINGS_REGISTRY: SettingDefinition[] = [
  {
    key: 'branding.appName',
    group: 'branding',
    label: 'App name',
    description: 'Shown in the header, the login page and the browser tab.',
    type: 'string',
    default: 'AI Knowledge Assistant',
    max: 60,
  },
  {
    key: 'branding.tagline',
    group: 'branding',
    label: 'Tagline',
    description: 'One line under the name on the login page.',
    type: 'string',
    default: 'Ask questions about your documents.',
    max: 140,
  },
  {
    key: 'branding.primaryColor',
    group: 'branding',
    label: 'Accent colour',
    description: 'Buttons, links and highlights across the app.',
    type: 'color',
    default: '#d8aa3e',
  },
  {
    key: 'chat.systemPrompt',
    group: 'chat',
    label: 'System prompt',
    description:
      'The standing instructions sent to the model before every question.',
    type: 'text',
    default:
      "You are a helpful assistant answering questions using the company's knowledge base. " +
      'Use the provided context to answer naturally and confidently, handling synonyms and ' +
      "paraphrased questions. If the answer isn't in the context, say so clearly.",
    max: 4000,
  },
  {
    key: 'chat.temperature',
    group: 'chat',
    label: 'Temperature',
    description:
      'Lower is more consistent, higher is more creative. 0 to 1.',
    type: 'number',
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    key: 'chat.maxTokens',
    group: 'chat',
    label: 'Maximum answer length (tokens)',
    description:
      'Longest answer the model may write. Reasoning models spend part of this on thinking.',
    type: 'number',
    default: 512,
    min: 64,
    max: 4096,
    step: 1,
  },
  {
    key: 'retrieval.topK',
    group: 'retrieval',
    label: 'Passages sent to the model',
    description: 'How many document chunks are retrieved for each question.',
    type: 'number',
    default: 12,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: 'retrieval.perFileCap',
    group: 'retrieval',
    label: 'Passages per file',
    description:
      'Most chunks one file may contribute, so a single document cannot crowd out the rest.',
    type: 'number',
    default: 4,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'chunking.targetWords',
    group: 'retrieval',
    label: 'Chunk size (words)',
    description: 'Applies to documents uploaded after the change.',
    type: 'number',
    default: 70,
    min: 20,
    max: 300,
    step: 1,
  },
  {
    key: 'chunking.overlapWords',
    group: 'retrieval',
    label: 'Chunk overlap (words)',
    description:
      'Words shared between neighbouring chunks of a long paragraph. Applies to new uploads.',
    type: 'number',
    default: 20,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: 'graph.hops',
    group: 'graph',
    label: 'Graph depth (hops)',
    description:
      'How far from a named entity the graph is followed. 2 answers linked questions.',
    type: 'number',
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
  {
    key: 'graph.maxFacts',
    group: 'graph',
    label: 'Graph facts per answer',
    description: 'Cap on relationships added to the prompt.',
    type: 'number',
    default: 25,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'cache.ttlDays',
    group: 'cache',
    label: 'Answer cache lifetime (days)',
    description:
      'Cached answers also expire whenever a document is added or removed.',
    type: 'number',
    default: 7,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: 'cache.warmQuestions',
    group: 'cache',
    label: 'Questions to pre-answer',
    description:
      'After a document change, this many top questions are answered ahead of time. 0 turns it off.',
    type: 'number',
    default: 5,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: 'auth.registration',
    group: 'auth',
    label: 'Who can sign in',
    description:
      '"open" lets any Google account in as a user. "invite-only" admits only invited emails and admins.',
    type: 'select',
    default: 'invite-only',
    options: ['open', 'invite-only'],
  },
];

const BY_KEY = new Map(SETTINGS_REGISTRY.map((def) => [def.key, def]));

export function findSetting(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

/** Returns the value in its stored type, or throws a 400 that names the field. */
export function validateSettingValue(
  def: SettingDefinition,
  raw: unknown,
): string | number {
  const fail = (why: string): never => {
    throw new BadRequestException(`${def.label}: ${why}`);
  };

  switch (def.type) {
    case 'string':
    case 'text': {
      if (typeof raw !== 'string') return fail('must be text');
      const value = raw.trim();
      if (value === '') return fail('cannot be empty');
      if (def.max !== undefined && value.length > def.max) {
        return fail(`must be at most ${def.max} characters`);
      }
      return value;
    }
    case 'color': {
      if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) {
        return fail('must be a hex colour like #d8aa3e');
      }
      return raw.toLowerCase();
    }
    case 'select': {
      if (typeof raw !== 'string' || !def.options?.includes(raw)) {
        return fail(`must be one of ${def.options?.join(', ')}`);
      }
      return raw;
    }
    case 'number': {
      const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail('must be a number');
      }
      if (def.min !== undefined && value < def.min) {
        return fail(`must be at least ${def.min}`);
      }
      if (def.max !== undefined && value > def.max) {
        return fail(`must be at most ${def.max}`);
      }
      if ((def.step ?? 1) >= 1 && !Number.isInteger(value)) {
        return fail('must be a whole number');
      }
      return value;
    }
  }
}
