import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { JudgeService } from './judge.service.js';

type AuthedReq = { user: { id: string } };

@Controller('challenges/:id/judge')
@UseGuards(JwtAuthGuard)
export class JudgeController {
  constructor(@Inject(JudgeService) private readonly judge: JudgeService) {}

  @Get()
  status(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.judge.getStatus(id, req.user.id);
  }

  @Post('propose')
  @HttpCode(200)
  propose(@Req() req: AuthedReq, @Param('id') id: string, @Body() body: { judgeId: string }) {
    return this.judge.propose(id, req.user.id, body?.judgeId);
  }

  @Post('approve')
  @HttpCode(200)
  approve(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.judge.approve(id, req.user.id);
  }

  @Post('verdict')
  @HttpCode(200)
  verdict(@Req() req: AuthedReq, @Param('id') id: string, @Body() body: { winnerId: string }) {
    return this.judge.verdict(id, req.user.id, body?.winnerId);
  }
}

