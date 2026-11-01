import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProfileService } from './profile.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get(':id/profile')
  profile(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.profiles.getProfile(req.user.id, id);
  }
}

