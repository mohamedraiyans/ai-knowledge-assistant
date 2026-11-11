import { Module } from '@nestjs/common';
import { ProviderFactory } from '../chat/provider-factory.service';
import { FaqModule } from '../faq/faq.module';
import { EncryptionService } from './encryption.service';
import { ProviderUsageService } from './provider-usage.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [FaqModule],
  controllers: [ProvidersController],
  // ProviderFactory lives here, next to the credentials and usage tracking it is built
  // from, so chat, graph extraction and evaluation all share one instance.
  providers: [ProvidersService, EncryptionService, ProviderUsageService, ProviderFactory],
  exports: [ProvidersService, ProviderUsageService, ProviderFactory],
})
export class ProvidersModule {}
