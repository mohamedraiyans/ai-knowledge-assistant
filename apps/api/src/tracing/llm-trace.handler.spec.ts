import type { LLMResult } from '@langchain/core/outputs';
import { extractUsage, LlmTraceHandler, type TraceRecord } from './llm-trace.handler';

function result(partial: Partial<LLMResult> & { generations: LLMResult['generations'] }): LLMResult {
  return partial as LLMResult;
}

describe('extractUsage', () => {
  it('reads token counts and model from the message metadata', () => {
    const output = result({
      generations: [
        [
          {
            text: 'hi',
            message: {
              usage_metadata: { input_tokens: 120, output_tokens: 30 },
              response_metadata: { model_name: 'openai/gpt-oss-120b' },
            },
          } as never,
        ],
      ],
    });
    expect(extractUsage(output)).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      model: 'openai/gpt-oss-120b',
    });
  });

  it('falls back to the older llmOutput.tokenUsage shape', () => {
    const output = result({
      generations: [[{ text: 'hi' }]],
      llmOutput: { tokenUsage: { promptTokens: 7, completionTokens: 3 } },
    });
    expect(extractUsage(output)).toEqual({ inputTokens: 7, outputTokens: 3, model: null });
  });

  it('reports unknown usage as null rather than zero', () => {
    expect(extractUsage(result({ generations: [[{ text: 'hi' }]] }))).toEqual({
      inputTokens: null,
      outputTokens: null,
      model: null,
    });
  });
});

describe('LlmTraceHandler', () => {
  afterEach(() => jest.useRealTimers());

  function setup() {
    const records: TraceRecord[] = [];
    const handler = new LlmTraceHandler('GROQ', 'chat', (call) => records.push(call));
    return { handler, records };
  }

  it('records latency, tokens and success for a finished call', () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { handler, records } = setup();

    handler.handleChatModelStart({} as never, [], 'run-1');
    jest.setSystemTime(1_450);
    handler.handleLLMEnd(
      result({
        generations: [[{ text: 'x', message: { usage_metadata: { input_tokens: 5, output_tokens: 2 } } } as never]],
      }),
      'run-1',
    );

    expect(records).toEqual([
      {
        provider: 'GROQ',
        purpose: 'chat',
        model: null,
        latencyMs: 450,
        inputTokens: 5,
        outputTokens: 2,
        ok: true,
        error: null,
      },
    ]);
  });

  it('records a failed call with its message, and never throws', () => {
    const { handler, records } = setup();
    handler.handleLLMStart({} as never, ['p'], 'run-2');

    expect(() => handler.handleLLMError(new Error('429 rate limited'), 'run-2')).not.toThrow();

    expect(records[0]).toMatchObject({ ok: false, error: '429 rate limited', inputTokens: null });
  });

  it('keeps concurrent runs apart', () => {
    jest.useFakeTimers().setSystemTime(0);
    const { handler, records } = setup();
    handler.handleLLMStart({} as never, [], 'a');
    jest.setSystemTime(100);
    handler.handleLLMStart({} as never, [], 'b');
    jest.setSystemTime(300);
    handler.handleLLMEnd(result({ generations: [[{ text: '' }]] }), 'a');
    jest.setSystemTime(400);
    handler.handleLLMEnd(result({ generations: [[{ text: '' }]] }), 'b');

    expect(records.map((r) => r.latencyMs)).toEqual([300, 300]);
  });

  it('truncates very long error messages', () => {
    const { handler, records } = setup();
    handler.handleLLMError(new Error('x'.repeat(2000)), 'run-3');
    expect(records[0].error).toHaveLength(500);
  });
});
