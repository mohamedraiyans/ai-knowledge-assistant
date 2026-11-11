import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ProvidersModule } from '../providers/providers.module';
import { EvalController } from './eval.controller';
import { EvalService } from './eval.service';

@Module({
  imports: [ChatModule, ProvidersModule],
  controllers: [EvalController],
  providers: [EvalService],
})
export class EvalModule {}
