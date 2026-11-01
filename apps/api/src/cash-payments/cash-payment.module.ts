import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CashPaymentController } from './cash-payment.controller.js';
import { CashPaymentService } from './cash-payment.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CashPaymentController],
  providers: [CashPaymentService, JwtAuthGuard],
  exports: [CashPaymentService],
})
export class CashPaymentModule {}

