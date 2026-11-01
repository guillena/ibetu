import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FriendsService } from './friends.service.js';

@Controller('friends')
export class FriendsController {
  constructor(@Inject(FriendsService) private readonly friends: FriendsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: { user: { id: string } }) {
    return this.friends.listFriends(req.user.id);
  }
}

