import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FriendsModule } from '../friends/friends.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [ProfileController],
  providers: [ProfileService, JwtAuthGuard],
  exports: [ProfileService],
})
export class ProfileModule {}

