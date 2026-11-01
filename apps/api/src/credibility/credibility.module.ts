import { Global, Module } from '@nestjs/common';
import { CredibilityService } from './credibility.service.js';

@Global()
@Module({
  providers: [CredibilityService],
  exports: [CredibilityService],
})
export class CredibilityModule {}

