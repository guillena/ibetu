import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { HistoryService } from './history.service.js';

@Controller('challenges')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(@Inject(HistoryService) private readonly history: HistoryService) {}

  /** Retos cerrados del usuario (más recientes primero). `with` filtra por rival. */
  @Get('history')
  list(
    @Req() req: { user: { id: string } },
    @Query('with') withUser?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.history.getHistory(req.user.id, { with: withUser, limit, cursor });
  }
}

