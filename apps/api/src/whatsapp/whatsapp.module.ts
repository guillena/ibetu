import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FriendsModule } from '../friends/friends.module.js';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappService } from './whatsapp.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, JwtAuthGuard],
  exports: [WhatsappService],
})
export class WhatsappModule {}

