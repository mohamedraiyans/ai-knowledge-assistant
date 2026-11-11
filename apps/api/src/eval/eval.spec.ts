import type { EvalCaseResult } from '@slm/shared-types';
import { judgePrompt, summarize } from './eval.service';

// The generated Prisma client sits outside jest's rootDir; only the DI token is needed.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../chat/chat.service', () => ({ ChatService: class {} }));

function result(overrides: Partial<EvalCaseResult>): EvalCaseResult {
  return {
    caseId: 'c',
    question: 'q',
    expected: 'e',
    answer: 'a',
    correct: true,
    grounded: true,
    reasoning: '',
    latencyMs: 100,
    ...overrides,
  };
}

describe('summarize', () => {
  it('counts correct and grounded answers separately', () => {
    const summary = summarize([
      result({ correct: true, grounded: true }),
      result({ correct: true, grounded: false }),
      result({ correct: false, grounded: false }),
    ]);
    expect(summary).toMatchObject({ total: 3, correct: 2, grounded: 1 });
  });

  it('averages latency to a whole number', () => {
    expect(summarize([result({ latencyMs: 100 }), result({ latencyMs: 201 })]).avgLatencyMs).toBe(151);
  });

  it('copes with an empty run', () => {
    expect(summarize([])).toEqual({ total: 0, correct: 0, grounded: 0, avgLatencyMs: 0 });
  });
});

describe('judgePrompt', () => {
  const base = { question: 'How much leave?', expected: '25 days', answer: '25 days.', passages: ['Leave is 25 days.'] };

  it('gives the grader the question, the reference, the passages and the answer', () => {
    const prompt = judgePrompt(base);
    expect(prompt).toContain('How much leave?');
    expect(prompt).toContain('REFERENCE ANSWER:\n25 days');
    expect(prompt).toContain('[1] Leave is 25 days.');
    expect(prompt).toContain('ASSISTANT ANSWER:\n25 days.');
  });

  it('tells the grader a true-but-unsupported claim is not grounded', () => {
    expect(judgePrompt(base)).toMatch(/NOT grounded/);
  });

  it('says so when nothing was retrieved, instead of leaving the section blank', () => {
    expect(judgePrompt({ ...base, passages: [] })).toContain('(no passages were retrieved)');
  });
});
