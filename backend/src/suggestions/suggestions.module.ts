import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsEnabledGuard } from './suggestions-enabled.guard';
import { SuggestionsService } from './suggestions.service';

@Module({
  controllers: [SuggestionsController],
  providers: [SuggestionsService, SuggestionsEnabledGuard],
})
export class SuggestionsModule {}
