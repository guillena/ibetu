import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChallengesService } from './challenges.service.js';
import type { CreateChallengeInput } from './challenges.service.js';
import { OpenChallengesService } from './open-challenges.service.js';

type AuthedReq = { user: { id: string } };

@Controller('challenges')
export class ChallengesController {
  constructor(
    @Inject(ChallengesService) private readonly challenges: ChallengesService,
    @Inject(OpenChallengesService) private readonly open: OpenChallengesService,
  ) {}

  /** Retos abiertos del usuario, clasificados por pestaña (En Juego, Por Declarar, Invitaciones). */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: AuthedReq) {
    return this.open.list(req.user.id);
  }

  @Get('presets')
  @UseGuards(JwtAuthGuard)
  presets() {
    return this.challenges.listPresets();
  }

  /** Vista previa pública por código de invitación (no exige sesión para renderizar OG y /r/[code]). */
  @Get('by-code/:code')
  byCode(@Param('code') code: string) {
    return this.challenges.getByInviteCode(code);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.challenges.getDetail(id, req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthedReq, @Body() body: CreateChallengeInput) {
    return this.challenges.create(req.user.id, body);
  }

  @Post(':id/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  accept(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.challenges.accept(id, req.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  cancel(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.challenges.cancel(id, req.user.id);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  reject(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.challenges.reject(id, req.user.id);
  }
}
