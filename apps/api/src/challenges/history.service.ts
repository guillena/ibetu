import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ChallengeMode, CashPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

export type HistoryOutcome = 'WON' | 'LOST' | 'DRAW';

export interface HistoryItem {
  id: string;
  title: string;
  mode: ChallengeMode;
  stakeAmount: number;
  closedAt: Date;
  rival: { id: string; username: string; displayName: string };
  outcome: HistoryOutcome;
  winnerId: string | null;
  /** Cómo se resolvió: de común acuerdo, por el Juez o por el silencio de 24 h. */
  resolvedBy: 'AGREEMENT' | 'JUDGE' | 'TIMEOUT' | null;
  hadDispute: boolean;
  /** Solo en retos por Plata. */
  cashPaymentStatus: CashPaymentStatus | null;
}

export interface HistorySummary {
  /** Retos cerrados considerados (todos los que cumplen el filtro, no solo la página). */
  total: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface HistoryPage {
  items: HistoryItem[];
  summary: HistorySummary;
  /** Para pedir la página siguiente; null si no hay más. */
  nextCursor: string | null;
}

@Injectable()
export class HistoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Historial competitivo del usuario: sus retos CERRADOS, del más reciente al más antiguo.
   * Con `with` se limita a los retos contra ese rival (el historial entre dos amigos) y el
   * balance de victorias es entre ambos. No incluye niveles ni rachas.
   */
  async getHistory(
    userId: string,
    opts: { with?: string; limit?: number | string; cursor?: string } = {},
  ): Promise<HistoryPage> {
    if (opts.with && opts.with === userId) {
      throw new BadRequestException('Elegí un rival distinto de vos para ver el historial.');
    }
    const limit = this.parseLimit(opts.limit);

    const base: Prisma.ChallengeWhereInput = {
      status: 'CLOSED',
      OR: [{ creatorId: userId }, { opponentId: userId }],
      ...(opts.with
        ? { AND: [{ OR: [{ creatorId: opts.with }, { opponentId: opts.with }] }] }
        : {}),
    };

    const cursor = opts.cursor ? this.decodeCursor(opts.cursor) : null;
    const page: Prisma.ChallengeWhereInput = cursor
      ? {
          ...base,
          // Clave compuesta (fecha, id): no repite ni salta retos que cierran en el mismo instante.
          AND: [
            ...((base.AND as Prisma.ChallengeWhereInput[] | undefined) ?? []),
            {
              OR: [
                { closedAt: { lt: cursor.closedAt } },
                { closedAt: cursor.closedAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : base;

    const rows = await this.prisma.challenge.findMany({
      where: page,
      orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        opponent: { select: { id: true, username: true, displayName: true } },
      },
    });
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const closedEvents = slice.length
      ? await this.prisma.challengeEvent.findMany({
          where: { challengeId: { in: slice.map((c) => c.id) }, eventType: 'CHALLENGE_CLOSED' },
          select: { challengeId: true, payload: true },
        })
      : [];
    const closedById = new Map(closedEvents.map((e) => [e.challengeId, (e.payload ?? {}) as Record<string, any>]));

    const items: HistoryItem[] = slice.map((c) => {
      const rival = (c.creatorId === userId ? c.opponent : c.creator)!;
      const closed = closedById.get(c.id) ?? {};
      return {
        id: c.id,
        title: c.title,
        mode: c.mode,
        stakeAmount: c.stakeAmount,
        closedAt: c.closedAt!,
        rival,
        outcome: c.winnerId === null ? 'DRAW' : c.winnerId === userId ? 'WON' : 'LOST',
        winnerId: c.winnerId,
        resolvedBy: closed.resolvedBy ?? null,
        hadDispute: closed.hadDispute ?? false,
        cashPaymentStatus: c.mode === 'CASH' ? c.cashPaymentStatus : null,
      };
    });

    const last = slice.at(-1);
    return {
      items,
      summary: await this.summarize(userId, base),
      nextCursor: hasMore && last ? this.encodeCursor(last.closedAt!, last.id) : null,
    };
  }

  /** Balance sobre todos los retos que cumplen el filtro, sin importar la página. */
  private async summarize(userId: string, base: Prisma.ChallengeWhereInput): Promise<HistorySummary> {
    const [total, wins, draws] = await Promise.all([
      this.prisma.challenge.count({ where: base }),
      this.prisma.challenge.count({ where: { ...base, winnerId: userId } }),
      this.prisma.challenge.count({ where: { ...base, winnerId: null } }),
    ]);
    return { total, wins, draws, losses: total - wins - draws };
  }

  private parseLimit(raw: number | string | undefined): number {
    if (raw === undefined || raw === '') return HISTORY_DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new BadRequestException('El límite debe ser un entero positivo.');
    }
    return Math.min(n, HISTORY_MAX_LIMIT);
  }

  private encodeCursor(closedAt: Date, id: string): string {
    return Buffer.from(`${closedAt.toISOString()}|${id}`).toString('base64url');
  }

  private decodeCursor(cursor: string): { closedAt: Date; id: string } {
    try {
      const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      const closedAt = new Date(iso);
      if (!id || Number.isNaN(closedAt.getTime())) throw new Error('cursor inválido');
      return { closedAt, id };
    } catch {
      throw new BadRequestException('El cursor de paginación es inválido.');
    }
  }
}

