import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { ProvidersModule } from '../providers/providers.module';
import { GraphController } from './graph.controller';
import { GraphExtractorService } from './graph-extractor.service';
import { GraphService } from './graph.service';

@Module({
  imports: [ProvidersModule, FeaturesModule],
  controllers: [GraphController],
  providers: [GraphService, GraphExtractorService],
  exports: [GraphService, GraphExtractorService],
})
export class GraphModule {}
