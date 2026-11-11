import type { FeatureKey } from '@slm/shared-types';

export interface FeatureDefinition {
  label: string;
  description: string;
  /** Applies until an admin toggles the feature for the first time. */
  defaultEnabled: boolean;
}

/**
 * Every optional feature the app knows about. Flags live in code rather than being
 * free-form rows, so a typo'd key fails to compile instead of silently creating a
 * flag nothing reads — the database only stores an admin's override.
 */
export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  faqCache: {
    label: 'Answer cache',
    description:
      'Serve repeated questions from Redis instead of calling the LLM again.',
    defaultEnabled: true,
  },
  faqSidebar: {
    label: 'Frequently asked list',
    description:
      'Show the most asked questions in the sidebar, ready to click.',
    defaultEnabled: true,
  },
  graphRag: {
    label: 'Knowledge graph (GraphRAG)',
    description:
      'Extract entities into Neo4j on upload and add connected facts to answers.',
    defaultEnabled: true,
  },
  usageBadges: {
    label: 'Provider usage badges',
    description: 'Show remaining rate-limit headroom next to the model picker.',
    defaultEnabled: true,
  },
};

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.hasOwn(FEATURE_REGISTRY, value);
}
