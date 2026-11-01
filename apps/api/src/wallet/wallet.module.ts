import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StreakService } from './streak.service.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [WalletService, StreakService, JwtAuthGuard],
  exports: [WalletService, StreakService],
})
export class WalletModule {}
