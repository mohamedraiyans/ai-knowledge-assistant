import { Global, Module } from '@nestjs/common';
import { FaqModule } from '../faq/faq.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

// Global: chat, retrieval, graph and cache code all read settings, and importing the
// module into each of them would only add noise.
@Global()
@Module({
  imports: [FaqModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
