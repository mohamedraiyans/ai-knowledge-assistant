import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { ProviderName } from '@slm/shared-types';

export type TracePurpose = 'chat' | 'graph-extraction' | 'eval-answer' | 'eval-judge';

export interface TraceRecord {
  provider: ProviderName;
  purpose: TracePurpose;
  model: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
  error: string | null;
}

interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Providers report token usage in different places: newer LangChain chat models put it
 * on the message's `usage_metadata`, older paths on `llmOutput.tokenUsage`. Look in
 * both so the trace has numbers whichever provider answered.
 */
export function extractUsage(output: LLMResult): Usage {
  const message = output.generations?.[0]?.[0] as
    | { message?: { usage_metadata?: Record<string, unknown>; response_metadata?: Record<string, unknown> } }
    | undefined;
  const meta = message?.message?.usage_metadata;
  const responseMeta = message?.message?.response_metadata;
  const legacy = output.llmOutput?.tokenUsage as Record<string, unknown> | undefined;

  const model =
    (responseMeta?.model_name as string | undefined) ??
    (responseMeta?.model as string | undefined) ??
    (output.llmOutput?.model_name as string | undefined) ??
    null;

  return {
    inputTokens: num(meta?.input_tokens) ?? num(legacy?.promptTokens),
    outputTokens: num(meta?.output_tokens) ?? num(legacy?.completionTokens),
    model,
  };
}

/**
 * A LangChain callback handler: attach it to any `invoke` and it records how long the
 * model took, how many tokens it used and whether it failed, without the calling code
 * knowing. Recording is fire-and-forget; tracing must never slow or break an answer.
 */
export class LlmTraceHandler extends BaseCallbackHandler {
  name = 'LlmTraceHandler';
  private readonly starts = new Map<string, number>();

  constructor(
    private readonly provider: ProviderName,
    private readonly purpose: TracePurpose,
    private readonly record: (call: TraceRecord) => void,
  ) {
    super();
  }

  handleLLMStart(_llm: Serialized, _prompts: string[], runId: string): void {
    this.starts.set(runId, Date.now());
  }

  handleChatModelStart(_llm: Serialized, _messages: BaseMessage[][], runId: string): void {
    this.starts.set(runId, Date.now());
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const usage = extractUsage(output);
    this.record({
      provider: this.provider,
      purpose: this.purpose,
      model: usage.model,
      latencyMs: this.elapsed(runId),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ok: true,
      error: null,
    });
  }

  handleLLMError(error: Error, runId: string): void {
    this.record({
      provider: this.provider,
      purpose: this.purpose,
      model: null,
      latencyMs: this.elapsed(runId),
      inputTokens: null,
      outputTokens: null,
      ok: false,
      error: String(error?.message ?? error).slice(0, 500),
    });
  }

  private elapsed(runId: string): number {
    const started = this.starts.get(runId);
    this.starts.delete(runId);
    return started === undefined ? 0 : Date.now() - started;
  }
}
