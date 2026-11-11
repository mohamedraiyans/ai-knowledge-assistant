import { Injectable, Logger } from '@nestjs/common';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LlmCallSummary, ProviderName, UsageStats } from '@slm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  LlmTraceHandler,
  type TracePurpose,
  type TraceRecord,
} from './llm-trace.handler';

const RECENT_LIMIT = 25;

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Callbacks to pass in the `callbacks` option of any LangChain `invoke`. */
  callbacks(provider: ProviderName, purpose: TracePurpose): BaseCallbackHandler[] {
    return [new LlmTraceHandler(provider, purpose, (call) => this.save(call))];
  }

  private save(call: TraceRecord): void {
    this.prisma.llmCall.create({ data: call }).catch((error: unknown) => {
      this.logger.warn(
        `Could not record LLM call: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async stats(): Promise<UsageStats> {
    const [totals, failed, byPurpose, recent] = await Promise.all([
      this.prisma.llmCall.aggregate({
        _count: { _all: true },
        _avg: { latencyMs: true },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.llmCall.count({ where: { ok: false } }),
      this.prisma.llmCall.groupBy({
        by: ['purpose'],
        _count: { _all: true },
        _avg: { latencyMs: true },
        orderBy: { purpose: 'asc' },
      }),
      this.prisma.llmCall.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      }),
    ]);

    return {
      totalCalls: totals._count._all,
      failedCalls: failed,
      avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      byPurpose: byPurpose.map((row) => ({
        purpose: row.purpose,
        calls: row._count._all,
        avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
      })),
      recent: recent.map(
        (row): LlmCallSummary => ({
          id: row.id,
          provider: row.provider,
          model: row.model,
          purpose: row.purpose,
          latencyMs: row.latencyMs,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          ok: row.ok,
          error: row.error,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
    };
  }
}
