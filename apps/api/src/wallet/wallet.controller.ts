import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  summary(@Req() req: { user: { id: string } }) {
    return this.wallet.getSummary(req.user.id);
  }

  @Post('lifeline')
  @UseGuards(JwtAuthGuard)
  lifeline(@Req() req: { user: { id: string } }) {
    return this.wallet.claimLifeline(req.user.id);
  }
}
