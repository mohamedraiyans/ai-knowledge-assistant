import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { FaqModule } from '../faq/faq.module';
import { FeaturesModule } from '../features/features.module';
import { GraphModule } from '../graph/graph.module';
import { ProvidersModule } from '../providers/providers.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { MemoryService } from './memory.service';

@Module({
  imports: [DocumentsModule, ProvidersModule, FaqModule, GraphModule, FeaturesModule],
  controllers: [ChatController],
  providers: [ChatService, MemoryService],
  exports: [ChatService],
})
export class ChatModule {}
