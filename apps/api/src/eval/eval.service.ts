import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type {
  EvalCaseResult,
  EvalCaseSummary,
  EvalRunSummary,
  ProviderName,
} from '@slm/shared-types';
import { ChatService } from '../chat/chat.service';
import { ProviderFactory } from '../chat/provider-factory.service';
import { PrismaService } from '../prisma/prisma.service';
import { TracingService } from '../tracing/tracing.service';

// A run is sequential and costs two LLM calls per case, so it is capped to keep one
// click from burning a provider's rate limit.
const MAX_CASES_PER_RUN = 25;
const MAX_CASES_STORED = 100;
// Judging uses a reasoning-friendly budget for the same reason extraction does.
const JUDGE_MAX_TOKENS = 2048;

const VerdictSchema = z.object({
  correct: z
    .boolean()
    .describe('True if the answer states the same facts as the reference answer'),
  grounded: z
    .boolean()
    .describe('True if every claim in the answer is supported by the retrieved passages'),
  reasoning: z.string().describe('One or two sentences explaining the verdict'),
});

export type Verdict = z.infer<typeof VerdictSchema>;

export function judgePrompt(input: {
  question: string;
  expected: string;
  answer: string;
  passages: string[];
}): string {
  const passages = input.passages.length
    ? input.passages.map((p, i) => `[${i + 1}] ${p}`).join('\n')
    : '(no passages were retrieved)';
  return (
    'You are grading an AI assistant. Judge the answer on two separate questions.\n' +
    '1. correct: does it state the same facts as the reference answer? Wording may differ.\n' +
    '2. grounded: is every claim supported by the retrieved passages? A claim that is ' +
    'true but not in the passages is NOT grounded. If the assistant correctly says it ' +
    'does not know, that counts as grounded.\n\n' +
    `QUESTION:\n${input.question}\n\n` +
    `REFERENCE ANSWER:\n${input.expected}\n\n` +
    `RETRIEVED PASSAGES:\n${passages}\n\n` +
    `ASSISTANT ANSWER:\n${input.answer}`
  );
}

/** Rolls per-case results up into the numbers an admin compares between runs. */
export function summarize(results: EvalCaseResult[]): {
  total: number;
  correct: number;
  grounded: number;
  avgLatencyMs: number;
} {
  const total = results.length;
  return {
    total,
    correct: results.filter((r) => r.correct).length,
    grounded: results.filter((r) => r.grounded).length,
    avgLatencyMs: total
      ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / total)
      : 0,
  };
}

@Injectable()
export class EvalService {
  private readonly logger = new Logger(EvalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly providerFactory: ProviderFactory,
    private readonly tracing: TracingService,
  ) {}

  async listCases(): Promise<EvalCaseSummary[]> {
    const rows = await this.prisma.evalCase.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(({ id, question, expected }) => ({ id, question, expected }));
  }

  async addCase(question: unknown, expected: unknown): Promise<EvalCaseSummary> {
    if (typeof question !== 'string' || !question.trim()) {
      throw new BadRequestException('A question is required');
    }
    if (typeof expected !== 'string' || !expected.trim()) {
      throw new BadRequestException('A reference answer is required');
    }
    if ((await this.prisma.evalCase.count()) >= MAX_CASES_STORED) {
      throw new BadRequestException(`At most ${MAX_CASES_STORED} test questions are kept`);
    }
    const row = await this.prisma.evalCase.create({
      data: { question: question.trim().slice(0, 500), expected: expected.trim().slice(0, 2000) },
    });
    return { id: row.id, question: row.question, expected: row.expected };
  }

  async removeCase(id: string): Promise<void> {
    await this.prisma.evalCase.deleteMany({ where: { id } });
  }

  async listRuns(): Promise<EvalRunSummary[]> {
    const rows = await this.prisma.evalRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
    return rows.map((row) => this.toSummary(row));
  }

  async run(provider: ProviderName, userId: string): Promise<EvalRunSummary> {
    const cases = (await this.prisma.evalCase.findMany({ orderBy: { createdAt: 'asc' } })).slice(
      0,
      MAX_CASES_PER_RUN,
    );
    if (cases.length === 0) throw new NotFoundException('Add at least one test question first');

    const results: EvalCaseResult[] = [];
    for (const testCase of cases) {
      results.push(await this.runCase(provider, testCase));
    }

    const row = await this.prisma.evalRun.create({
      data: { provider, ...summarize(results), results: results as never, createdBy: userId },
    });
    return this.toSummary(row);
  }

  private async runCase(
    provider: ProviderName,
    testCase: { id: string; question: string; expected: string },
  ): Promise<EvalCaseResult> {
    const base = {
      caseId: testCase.id,
      question: testCase.question,
      expected: testCase.expected,
    };

    const started = Date.now();
    let answer: string;
    let passages: string[];
    try {
      // The real pipeline, end to end, so the score reflects what users actually get.
      const generated = await this.chat.generateAnswer(testCase.question, provider, 'eval-answer');
      answer = generated.answer;
      passages = generated.sources.map((s) => s.text);
    } catch (error) {
      return {
        ...base,
        answer: '',
        correct: false,
        grounded: false,
        reasoning: `The assistant failed to answer: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs: Date.now() - started,
      };
    }
    const latencyMs = Date.now() - started;

    const verdict = await this.judge(provider, { ...testCase, answer, passages });
    return { ...base, answer, ...verdict, latencyMs };
  }

  private async judge(
    provider: ProviderName,
    input: { question: string; expected: string; answer: string; passages: string[] },
  ): Promise<Verdict> {
    try {
      const model = await this.providerFactory.build(provider, {
        maxTokens: JUDGE_MAX_TOKENS,
        temperature: 0,
      });
      const structured = model.withStructuredOutput(VerdictSchema, { name: 'grade' });
      return await structured.invoke(judgePrompt(input), {
        callbacks: this.tracing.callbacks(provider, 'eval-judge'),
      });
    } catch (error) {
      this.logger.warn(`Judge failed: ${error instanceof Error ? error.message : String(error)}`);
      return { correct: false, grounded: false, reasoning: 'The grader could not produce a verdict.' };
    }
  }

  private toSummary(row: {
    id: string;
    provider: string;
    total: number;
    correct: number;
    grounded: number;
    avgLatencyMs: number;
    results: unknown;
    createdAt: Date;
  }): EvalRunSummary {
    return {
      id: row.id,
      provider: row.provider as ProviderName,
      total: row.total,
      correct: row.correct,
      grounded: row.grounded,
      avgLatencyMs: row.avgLatencyMs,
      results: row.results as EvalCaseResult[],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
