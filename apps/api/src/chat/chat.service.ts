import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { Document } from '@langchain/core/documents';
import type { ProviderName } from '@slm/shared-types';
import {
  KnowledgeBaseRetriever,
  type KnowledgeBaseDocMetadata,
} from '../documents/knowledge-base-retriever';
import type { VectorMatch } from '../documents/vector-store.service';
import { FaqService } from '../faq/faq.service';
import { FeaturesService } from '../features/features.service';
import { GraphService } from '../graph/graph.service';
import { ProvidersService } from '../providers/providers.service';
import { SettingsService } from '../settings/settings.service';
import type { TracePurpose } from '../tracing/llm-trace.handler';
import { TracingService } from '../tracing/tracing.service';
import { MemoryService } from './memory.service';
import { ProviderFactory } from './provider-factory.service';
import { buildRagGraph } from './rag-graph';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toVectorMatches(docs: Document<KnowledgeBaseDocMetadata>[]): VectorMatch[] {
  return docs.map((doc) => ({
    filename: doc.metadata.filename,
    text: doc.pageContent,
    score: doc.metadata.score,
  }));
}

const SECONDS_PER_DAY = 60 * 60 * 24;

export interface ChatResult {
  answer: string;
  sources: VectorMatch[];
  cached: boolean;
  graphFacts: string[];
}

interface GeneratedAnswer {
  answer: string;
  sources: VectorMatch[];
  graphFacts: string[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // The flow is compiled once. Its steps close over this service, so the retriever,
  // graph lookup and model factory are all real injected collaborators.
  private readonly ragGraph = buildRagGraph({
    retrieve: (question, config) => this.retriever.invoke(question, config),
    lookupGraph: (question) => this.lookupGraphFacts(question),
    buildModel: (provider) => this.providerFactory.build(provider),
    systemPrompt: () => this.settings.getString('chat.systemPrompt'),
  });

  constructor(
    private readonly retriever: KnowledgeBaseRetriever,
    private readonly providerFactory: ProviderFactory,
    private readonly memory: MemoryService,
    private readonly faq: FaqService,
    private readonly providers: ProvidersService,
    private readonly graph: GraphService,
    private readonly settings: SettingsService,
    private readonly features: FeaturesService,
    private readonly tracing: TracingService,
  ) {}

  private async lookupGraphFacts(question: string): Promise<string[]> {
    if (!(await this.features.isEnabled('graphRag'))) return [];
    const [maxFacts, hops] = await Promise.all([
      this.settings.getNumber('graph.maxFacts'),
      this.settings.getNumber('graph.hops'),
    ]);
    return this.graph.factsFor(question, maxFacts, hops);
  }

  async handleChat(userId: string, question: string, provider: ProviderName): Promise<ChatResult> {
    this.memory.save(userId, 'user', question);
    // Frequency is tracked regardless of provider or cache outcome, since it's the
    // question itself that's "frequently asked", not any one provider's answer to it.
    void this.faq.recordQuestion(question);
    void this.faq.recordRecent(question);

    const cacheEnabled = await this.features.isEnabled('faqCache');
    const cached = cacheEnabled ? await this.faq.getCachedAnswer(provider, question) : null;
    if (cached) {
      this.memory.save(userId, 'assistant', cached.answer);
      return { answer: cached.answer, sources: cached.sources, cached: true, graphFacts: [] };
    }

    const { answer, sources, graphFacts } = await this.generateAnswer(question, provider);
    this.memory.save(userId, 'assistant', answer);
    if (cacheEnabled) await this.cacheAnswer(provider, question, { answer, sources });
    return { answer, sources, cached: false, graphFacts };
  }

  private async cacheAnswer(
    provider: ProviderName,
    question: string,
    result: { answer: string; sources: VectorMatch[] },
  ): Promise<void> {
    const ttlDays = await this.settings.getNumber('cache.ttlDays');
    await this.faq.setCachedAnswer(provider, question, result, ttlDays * SECONDS_PER_DAY);
  }

  /**
   * Retrieval + generation only. Deliberately touches neither conversation memory
   * nor the question-frequency counter, so background warming can reuse it without
   * polluting a user's chat history or inflating the "frequently asked" ranking.
   */
  async generateAnswer(
    question: string,
    provider: ProviderName,
    purpose: TracePurpose = 'chat',
  ): Promise<GeneratedAnswer> {
    const state = await this.ragGraph.invoke(
      { question, provider },
      { callbacks: this.tracing.callbacks(provider, purpose) },
    );

    if (!state.answer.trim()) {
      // Don't cache or persist a blank reply — an empty LLM response is a
      // provider hiccup, not a valid answer, and caching it would serve the
      // same blank reply forever until the cache version next bumps.
      throw new InternalServerErrorException(
        `${provider} returned an empty response. Try again or switch providers.`,
      );
    }

    return {
      answer: state.answer,
      sources: toVectorMatches(state.docs),
      graphFacts: state.graphFacts,
    };
  }

  /**
   * Pre-generates answers for the most-asked questions so clicking one in the
   * "Frequently Asked" tab is instant instead of paying for a fresh LLM call.
   *
   * Runs at most once per cache version, which means it re-warms exactly once
   * after each document upload/delete (those bump the version) and is otherwise a
   * no-op no matter how often the FAQ list is polled. Best-effort by design: it
   * never throws, and a failure for one question/provider doesn't stop the rest.
   */
  async warmFrequentQuestions(): Promise<void> {
    try {
      // Warming is multiplied by the number of configured providers in LLM calls per
      // document change, so the admin sets how many questions it covers (0 = off).
      const limit = await this.settings.getNumber('cache.warmQuestions');
      if (limit <= 0 || !(await this.features.isEnabled('faqCache'))) return;

      const questions = await this.faq.getTopQuestions(limit);
      if (questions.length === 0) return;

      const providers = await this.providers.findActiveProviderNames();
      if (providers.length === 0) return;

      // Claimed last, so an empty question list or unconfigured provider doesn't
      // burn this version's single warm attempt.
      if (!(await this.faq.claimWarmSlot())) return;

      let warmed = 0;
      for (const provider of providers) {
        for (const { question } of questions) {
          try {
            if (await this.faq.getCachedAnswer(provider, question)) continue;
            const { answer, sources } = await this.generateAnswer(question, provider);
            await this.cacheAnswer(provider, question, { answer, sources });
            warmed += 1;
          } catch (error) {
            this.logger.warn(
              `FAQ warm failed for ${provider} / "${question}": ${describeError(error)}`,
            );
          }
        }
      }
      this.logger.log(`FAQ warm complete: cached ${warmed} answer(s)`);
    } catch (error) {
      this.logger.warn(`FAQ warm aborted: ${describeError(error)}`);
    }
  }
}
