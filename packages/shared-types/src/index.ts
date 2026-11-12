export interface HealthStatus {
  status: "ok";
  service: string;
}

export type Role = "ADMIN" | "USER";

export const PROVIDER_NAMES = ["GROQ", "AZURE_OPENAI", "ANTHROPIC"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
}

export interface ProviderCredentialPublic {
  id: string;
  provider: ProviderName;
  label: string;
  isActive: boolean;
  /** Non-secret config (model, deployment name...). The key itself is never returned. */
  extraConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  chunkCount: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
}

export interface AllowedEmailSummary {
  email: string;
  role: Role;
  createdAt: string;
}

export interface ChatSourceMatch {
  filename: string;
  text: string;
  score: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response: string;
  sources: ChatSourceMatch[];
  cached: boolean;
  /** Relationships the knowledge graph contributed to this answer (empty if none or cached). */
  graphFacts: string[];
}

export interface FaqEntry {
  /** Normalized question text (lowercased, trimmed, punctuation-stripped) */
  question: string;
  count: number;
}

export type FeatureKey = "faqCache" | "faqSidebar" | "graphRag" | "usageBadges";

export interface FeatureState {
  key: FeatureKey;
  label: string;
  description: string;
  enabled: boolean;
}

export type SettingType = "string" | "text" | "number" | "color" | "select";

export type SettingGroup = "branding" | "chat" | "retrieval" | "graph" | "cache" | "auth";

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  type: SettingType;
  default: string | number;
  min?: number;
  max?: number;
  /** Increment for number fields; 1 or more means whole numbers only. */
  step?: number;
  options?: string[];
}

export interface SettingsPayload {
  definitions: SettingDefinition[];
  values: Record<string, string | number>;
}

/** The slice of settings an unauthenticated visitor (the login page) may see. */
export interface PublicSettings {
  appName: string;
  tagline: string;
  primaryColor: string;
}

export interface LlmCallSummary {
  id: string;
  provider: ProviderName;
  model: string | null;
  purpose: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
}

export interface UsageStats {
  totalCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  byPurpose: { purpose: string; calls: number; avgLatencyMs: number }[];
  recent: LlmCallSummary[];
}

export interface EvalCaseSummary {
  id: string;
  question: string;
  expected: string;
}

export interface EvalCaseResult {
  caseId: string;
  question: string;
  expected: string;
  answer: string;
  correct: boolean;
  grounded: boolean;
  reasoning: string;
  latencyMs: number;
}

export interface EvalRunSummary {
  id: string;
  provider: ProviderName;
  total: number;
  correct: number;
  grounded: number;
  avgLatencyMs: number;
  results: EvalCaseResult[];
  createdAt: string;
}

export interface ProviderUsageWindow {
  limit: number | null;
  remaining: number | null;
  /** Raw reset value from the provider's header (format varies by provider) */
  resetHint: string | null;
}

export interface ProviderUsageSnapshot {
  provider: ProviderName;
  requests: ProviderUsageWindow;
  tokens: ProviderUsageWindow;
  /** null until at least one chat call has been made against this provider since server start */
  updatedAt: string | null;
}
