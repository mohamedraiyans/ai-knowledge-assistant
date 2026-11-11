import { Global, Module } from '@nestjs/common';
import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';

// Global so chat, graph extraction and evaluation can all attach the same handler.
@Global()
@Module({
  controllers: [TracingController],
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
