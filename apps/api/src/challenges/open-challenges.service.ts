import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OPEN_STATUSES, countItems, sortItems, toItem } from './open-challenges.js';
import type { OpenChallengeItem, OpenChallengeList, OpenChallengeRow } from './open-challenges.js';

/** Tope de seguridad: un usuario con más retos abiertos que esto es un caso anómalo. */
export const OPEN_LIST_LIMIT = 200;

@Injectable()
export class OpenChallengesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Retos abiertos del usuario (pendientes, activos, esperando declaración o en disputa),
   * ya clasificados por pestaña. Incluye los retos que debe fallar como Juez asignado.
   * Los retos cerrados o cancelados están en el historial.
   */
  async list(userId: string): Promise<OpenChallengeList> {
    const rows = (await this.prisma.challenge.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        OR: [
          { creatorId: userId },
          { opponentId: userId },
          { judgeId: userId, judgeAssignedAt: { not: null } },
        ],
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        opponent: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: OPEN_LIST_LIMIT,
    })) as OpenChallengeRow[];

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const items = sortItems(
      rows.map((r) => toItem(r, userId, appUrl)).filter((i): i is OpenChallengeItem => i !== null),
    );
    return { items, counts: countItems(items) };
  }
}

