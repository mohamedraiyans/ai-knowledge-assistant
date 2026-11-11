import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { z } from 'zod';
import { ProvidersService } from '../providers/providers.service';
import { ProviderFactory } from '../chat/provider-factory.service';
import type { Chunk } from '../documents/document-chunker';
import { FeaturesService } from '../features/features.service';
import { TracingService } from '../tracing/tracing.service';
import { GraphService, type Triple } from './graph.service';

const BATCH_SIZE = 3;
// Headroom for reasoning models, which spend part of the budget thinking before they answer.
const EXTRACTION_MAX_TOKENS = 4096;

const ENTITY_TYPES = 'Person, Organization, Project, Skill, Place, Technology, Concept';

const INSTRUCTIONS =
  'Extract a knowledge graph from the text below. ' +
  `Entity types are one of ${ENTITY_TYPES}. ` +
  'Predicate is a short verb phrase like "works at", "built", "uses", "located in". ' +
  'Use full proper names (never pronouns). Only include facts stated in the text.';

// Used only when structured output is unavailable for a model: ask for raw JSON instead.
const JSON_FALLBACK_PROMPT =
  `${INSTRUCTIONS} Return ONLY a JSON array, no prose. ` +
  'Each item: {"subject":"","subjectType":"","predicate":"","object":"","objectType":""}.\n\nTEXT:\n';

const TripleSchema = z.object({
  triples: z
    .array(
      z.object({
        subject: z.string().describe('Full name of the source entity'),
        subjectType: z.string().describe(`One of ${ENTITY_TYPES}`),
        predicate: z.string().describe('Short verb phrase, e.g. "works at"'),
        object: z.string().describe('Full name of the target entity'),
        objectType: z.string().describe(`One of ${ENTITY_TYPES}`),
      }),
    )
    .describe('Every fact stated in the text'),
});

/** Keeps only well-formed triples and trims them, whichever way they were produced. */
export function cleanTriples(items: unknown[]): Triple[] {
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const result: Triple[] = [];
  for (const item of items) {
    const t = (item ?? {}) as Record<string, unknown>;
    const subject = text(t.subject);
    const predicate = text(t.predicate);
    const object = text(t.object);
    if (!subject || !predicate || !object) continue;
    result.push({
      subject,
      subjectType: text(t.subjectType) || 'Concept',
      predicate,
      object,
      objectType: text(t.objectType) || 'Concept',
    });
  }
  return result;
}

/** Pulls the JSON array out of a reply that may be wrapped in a code fence or prose. */
export function parseTriples(raw: string): Triple[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? cleanTriples(parsed) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class GraphExtractorService {
  private readonly logger = new Logger(GraphExtractorService.name);

  constructor(
    private readonly graph: GraphService,
    private readonly providers: ProvidersService,
    private readonly providerFactory: ProviderFactory,
    private readonly features: FeaturesService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Background indexing: never throws and is never awaited by the upload, because
   * extraction costs one LLM call per few chunks.
   */
  async indexDocument(filename: string, chunks: Chunk[]): Promise<void> {
    if (!this.graph.enabled || !(await this.features.isEnabled('graphRag'))) return;
    try {
      const [provider] = await this.providers.findActiveProviderNames();
      if (!provider) {
        this.logger.warn('No active LLM provider; skipping graph extraction');
        return;
      }
      // Temperature 0: extraction should be repeatable, not creative.
      const model = await this.providerFactory.build(provider, {
        maxTokens: EXTRACTION_MAX_TOKENS,
        temperature: 0,
      });
      const callbacks = this.tracing.callbacks(provider, 'graph-extraction');
      const triples: Triple[] = [];
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const text = chunks
          .slice(i, i + BATCH_SIZE)
          .map((c) => c.text)
          .join('\n\n');
        try {
          const batch = await this.extractBatch(model, text, callbacks);
          if (batch.length === 0) {
            this.logger.warn(`No facts extracted for ${filename} batch ${i / BATCH_SIZE + 1}`);
          }
          triples.push(...batch);
        } catch (error) {
          this.logger.warn(`Extraction batch failed for ${filename}: ${(error as Error).message}`);
        }
      }
      await this.graph.replaceDocument(filename, triples);
      this.logger.log(`Graph indexed ${filename}: ${triples.length} facts via ${provider}`);
    } catch (error) {
      this.logger.warn(`Graph indexing of ${filename} aborted: ${(error as Error).message}`);
    }
  }

  /**
   * Preferred path: LangChain structured output, where the model is bound to a zod
   * schema and the reply arrives already parsed and typed. If a model can't do that (or
   * returns nothing), fall back to asking for raw JSON and parsing it by hand.
   */
  private async extractBatch(
    model: BaseChatModel,
    text: string,
    callbacks: BaseCallbackHandler[],
  ): Promise<Triple[]> {
    try {
      const structured = model.withStructuredOutput(TripleSchema, { name: 'knowledge_graph' });
      const result = await structured.invoke(`${INSTRUCTIONS}\n\nTEXT:\n${text}`, { callbacks });
      const triples = cleanTriples(result.triples);
      if (triples.length > 0) return triples;
    } catch (error) {
      this.logger.debug(`Structured output unavailable, falling back: ${(error as Error).message}`);
    }
    const reply = await model.invoke(JSON_FALLBACK_PROMPT + text, { callbacks });
    return parseTriples(String(reply.content));
  }
}
