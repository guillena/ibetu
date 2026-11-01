import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Vote } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChallengeResultsService } from './results.service.js';

type AuthedReq = { user: { id: string } };

@Controller('challenges/:id')
@UseGuards(JwtAuthGuard)
export class ResultsController {
  constructor(@Inject(ChallengeResultsService) private readonly results: ChallengeResultsService) {}

  /** Declara o cambia el voto: WIN ("gané yo"), LOSS ("ganó mi rival") o DRAW ("empate"). */
  @Post('declare')
  @HttpCode(200)
  declare(@Req() req: AuthedReq, @Param('id') id: string, @Body() body: { vote: Vote }) {
    return this.results.declare(id, req.user.id, body?.vote);
  }
}

