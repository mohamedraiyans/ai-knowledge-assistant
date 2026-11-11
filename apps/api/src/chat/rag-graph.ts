import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, type RunnableConfig } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ProviderName } from '@slm/shared-types';
import type { KnowledgeBaseDocMetadata } from '../documents/knowledge-base-retriever';

/**
 * The question-answering flow as an explicit LangGraph state machine:
 *
 *            ┌─ retrieve (vector search) ─┐
 *   START ───┤                            ├──> generate ──> END
 *            └─ graph (Neo4j facts) ──────┘
 *
 * The two lookups are independent, so they run in parallel and `generate` waits for
 * both. Each step is a named node, which is what makes the flow traceable, testable in
 * isolation and easy to extend (a re-ranking or guardrail node slots in as one more edge).
 */
export const RagState = Annotation.Root({
  question: Annotation<string>(),
  provider: Annotation<ProviderName>(),
  docs: Annotation<Document<KnowledgeBaseDocMetadata>[]>(),
  graphFacts: Annotation<string[]>(),
  answer: Annotation<string>(),
});

export type RagStateType = typeof RagState.State;

export interface RagDeps {
  retrieve(question: string, config?: RunnableConfig): Promise<Document<KnowledgeBaseDocMetadata>[]>;
  lookupGraph(question: string): Promise<string[]>;
  buildModel(provider: ProviderName): Promise<BaseChatModel>;
  systemPrompt(): Promise<string>;
}

// The system prompt is passed as a variable, not baked into the template, so braces in
// an admin-written prompt can never be misread as template placeholders.
const promptTemplate = ChatPromptTemplate.fromMessages([
  ['system', '{system}'],
  ['human', 'Context:\n{context}{graph}\n\nQuestion: {question}'],
]);

export function formatDocuments(docs: Document<KnowledgeBaseDocMetadata>[]): string {
  return docs.length
    ? docs.map((doc) => `[${doc.metadata.filename}] ${doc.pageContent}`).join('\n\n')
    : 'No relevant information found in the knowledge base.';
}

export function formatGraphFacts(facts: string[]): string {
  return facts.length
    ? `\n\nKnown relationships from the knowledge graph:\n${facts.join('\n')}`
    : '';
}

export function buildRagGraph(deps: RagDeps) {
  return new StateGraph(RagState)
    .addNode('retrieve', async (state: RagStateType, config?: RunnableConfig) => ({
      docs: await deps.retrieve(state.question, config),
    }))
    .addNode('graph', async (state: RagStateType) => ({
      graphFacts: await deps.lookupGraph(state.question),
    }))
    .addNode('generate', async (state: RagStateType, config?: RunnableConfig) => {
      const [model, system] = await Promise.all([
        deps.buildModel(state.provider),
        deps.systemPrompt(),
      ]);
      const chain = RunnableSequence.from([promptTemplate, model, new StringOutputParser()]);
      const answer = await chain.invoke(
        {
          system,
          context: formatDocuments(state.docs),
          graph: formatGraphFacts(state.graphFacts),
          question: state.question,
        },
        config,
      );
      return { answer };
    })
    .addEdge(START, 'retrieve')
    .addEdge(START, 'graph')
    .addEdge(['retrieve', 'graph'], 'generate')
    .addEdge('generate', END)
    .compile();
}
