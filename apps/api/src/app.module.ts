import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CashPaymentModule } from './cash-payments/cash-payment.module.js';
import { ChallengesModule } from './challenges/challenges.module.js';
import { ClockSchedulerModule } from './clocks/clock-scheduler.module.js';
import { CredibilityModule } from './credibility/credibility.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ClockSchedulerModule,
    CredibilityModule,
    ProfileModule,
    WalletModule,
    AuthModule,
    FriendsModule,
    WhatsappModule,
    CashPaymentModule,
    ChallengesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
