import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const STREAK_DAYS = 3;
export const STREAK_BONUS_COINS = 30;
export const STREAK_TIMEZONE = process.env.STREAK_TIMEZONE ?? 'America/Argentina/Buenos_Aires';

export type ChallengeOutcome = 'WIN' | 'DRAW' | 'CANCELLED';

/** Cliente de transacción interactiva de Prisma. */
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface ChallengeClosedInput {
  /** Ambos jugadores: la constancia premia jugar, no ganar. */
  userIds: string[];
  outcome: ChallengeOutcome;
  /** true si el reto llegó a estado DISPUTA en algún momento. */
  hadDispute: boolean;
  closedAt: Date;
}

export interface StreakResult {
  userId: string;
  counted: boolean;
  streakDays: number;
  bonusGranted: boolean;
}

/** Día calendario (YYYY-MM-DD) de una fecha en la zona horaria dada. */
export function calendarDay(date: Date, timeZone = STREAK_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Diferencia en días enteros entre dos días calendario (b - a). */
export function dayDiff(a: string, b: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

@Injectable()
export class StreakService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Registra el cierre de un reto para el Premio de Constancia.
   * Solo suma el día si el reto terminó con ganador definido y sin disputa
   * (empates, cancelaciones y disputas no cuentan).
   * Si se pasa `tx`, corre dentro de esa transacción (el cierre del reto es atómico).
   */
  async onChallengeClosed(input: ChallengeClosedInput, tx?: Tx): Promise<StreakResult[]> {
    const results: StreakResult[] = [];
    const eligible = input.outcome === 'WIN' && !input.hadDispute;
    // Orden fijo de bloqueo entre usuarios para evitar deadlocks entre cierres simultáneos.
    for (const userId of [...new Set(input.userIds)].sort()) {
      if (!eligible) {
        const u = await (tx ?? this.prisma).user.findUniqueOrThrow({ where: { id: userId } });
        results.push({ userId, counted: false, streakDays: u.streakDaysCount, bonusGranted: false });
        continue;
      }
      results.push(await this.registerCleanDay(userId, input.closedAt, tx));
    }
    return results;
  }

  /**
   * Suma un día de constancia al usuario. Todo ocurre en una transacción con el
   * usuario bloqueado: dos cierres simultáneos no pueden contar el mismo día ni
   * pagar el premio dos veces.
   */
  private async registerCleanDay(userId: string, closedAt: Date, outer?: Tx): Promise<StreakResult> {
    const body = async (tx: Tx): Promise<StreakResult> => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      const today = calendarDay(closedAt);
      const last = user.lastCleanChallengeAt ? calendarDay(user.lastCleanChallengeAt) : null;

      // Ya contó un reto limpio hoy: no suma otro día.
      if (last !== null && dayDiff(last, today) <= 0) {
        return { userId, counted: false, streakDays: user.streakDaysCount, bonusGranted: false };
      }

      // Día consecutivo continúa la cuenta; cualquier salto la reinicia en 1.
      const consecutive = last !== null && dayDiff(last, today) === 1;
      const days = consecutive ? user.streakDaysCount + 1 : 1;

      if (days >= STREAK_DAYS) {
        await tx.walletTransaction.create({
          data: {
            userId,
            currency: 'COINS',
            type: 'STREAK3',
            amount: STREAK_BONUS_COINS,
            idempotencyKey: `streak3:${userId}:${today}`,
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            coinsAvailable: { increment: STREAK_BONUS_COINS },
            streakDaysCount: 0, // se reinicia el ciclo tras otorgar el premio
            lastCleanChallengeAt: closedAt,
          },
        });
        return { userId, counted: true, streakDays: 0, bonusGranted: true };
      }

      await tx.user.update({
        where: { id: userId },
        data: { streakDaysCount: days, lastCleanChallengeAt: closedAt },
      });
      return { userId, counted: true, streakDays: days, bonusGranted: false };
    };
    return outer ? body(outer) : this.prisma.$transaction(body);
  }
}

