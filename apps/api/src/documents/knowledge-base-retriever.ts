import { Injectable } from '@nestjs/common';
import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { SettingsService } from '../settings/settings.service';
import { VectorStoreService } from './vector-store.service';

export interface KnowledgeBaseDocMetadata extends Record<string, unknown> {
  filename: string;
  score: number;
}

/**
 * A real LangChain retriever over the Chroma store. How many passages it returns and
 * how many one file may contribute are admin settings (retrieval.topK and
 * retrieval.perFileCap), read on every call so a change applies to the next question.
 */
@Injectable()
export class KnowledgeBaseRetriever extends BaseRetriever<KnowledgeBaseDocMetadata> {
  lc_namespace = ['slm', 'retrievers', 'knowledge_base'];

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async _getRelevantDocuments(query: string): Promise<Document<KnowledgeBaseDocMetadata>[]> {
    const [topK, perFileCap] = await Promise.all([
      this.settings.getNumber('retrieval.topK'),
      this.settings.getNumber('retrieval.perFileCap'),
    ]);
    const matches = await this.vectorStore.query(query, topK, perFileCap);
    return matches.map(
      (m) => new Document({ pageContent: m.text, metadata: { filename: m.filename, score: m.score } }),
    );
  }
}
