import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';
import { ProvidersModule } from './providers/providers.module';
import { EvalModule } from './eval/eval.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { FaqModule } from './faq/faq.module';
import { FeaturesModule } from './features/features.module';
import { GraphModule } from './graph/graph.module';
import { SettingsModule } from './settings/settings.module';
import { TracingModule } from './tracing/tracing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '..', '..', '.env'),
    }),
    // Global per-IP ceiling; the chat endpoint sets a tighter @Throttle of its own
    // because every request there is a paid LLM call.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    RedisModule,
    PrismaModule,
    SettingsModule,
    TracingModule,
    FaqModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    ChatModule,
    ProvidersModule,
    EvalModule,
    FeaturesModule,
    GraphModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
