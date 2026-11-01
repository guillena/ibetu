import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CashPaymentService } from './cash-payment.service.js';

type AuthedReq = { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard)
export class CashPaymentController {
  constructor(@Inject(CashPaymentService) private readonly payments: CashPaymentService) {}

  @Put('me/payment-alias')
  setAlias(@Req() req: AuthedReq, @Body() body: { alias: string }) {
    return this.payments.setPaymentAlias(req.user.id, body?.alias);
  }

  @Get('challenges/:id/cash-payment')
  info(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.payments.getPaymentInfo(id, req.user.id);
  }

  @Post('challenges/:id/cash-payment/paid')
  @HttpCode(200)
  paid(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.payments.markPaid(id, req.user.id);
  }

  @Post('challenges/:id/cash-payment/confirm')
  @HttpCode(200)
  confirm(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.payments.confirmReceived(id, req.user.id);
  }

  @Post('challenges/:id/cash-payment/default')
  @HttpCode(200)
  default(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.payments.claimDefault(id, req.user.id);
  }
}

