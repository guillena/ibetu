import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const LIFELINE_COINS = 20;
export const LIFELINE_THRESHOLD = 10;
export const LIFELINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const JUDGE_REWARD_COINS = 5;
export const JUDGE_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface LifelineResult {
  granted: number;
  coinsAvailable: number;
  nextAvailableAt: Date;
}

export class LifelineNotAllowedException extends BadRequestException {
  constructor(
    code: 'HAS_RESERVED_COINS' | 'BALANCE_NOT_LOW' | 'COOLDOWN',
    message: string,
    nextAvailableAt?: Date,
  ) {
    super({ code, message, ...(nextAvailableAt ? { nextAvailableAt } : {}) });
  }
}

export class InsufficientFundsException extends BadRequestException {
  constructor(userId: string, needed: number, available: number) {
    super({
      message: 'Saldo insuficiente de monedas.',
      userId,
      needed,
      available,
    });
  }
}

/** Cliente de transacción interactiva de Prisma. */
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Monedero de monedas (modo COINS).
 *
 * Invariantes:
 *  - `WalletTransaction.amount` es el cambio sobre `coinsAvailable`; por lo tanto
 *    `coinsAvailable` == suma de los asientos del usuario.
 *  - Toda operación es idempotente por `idempotencyKey` (única en la base).
 *  - Liquidación y reembolso de un reto comparten la clave `settle:<reto>:<usuario>`:
 *    un reto no puede pagarse y reembolsarse a la vez, ni pagarse dos veces.
 */
@Injectable()
export class WalletService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  static reserveKey(challengeId: string, userId: string) {
    return `reserve:${challengeId}:${userId}`;
  }
  static settleKey(challengeId: string, userId: string) {
    return `settle:${challengeId}:${userId}`;
  }

  /** Bloquea las filas de usuario en orden determinista (evita deadlocks). */
  private async lockUsers(tx: Tx, userIds: string[]) {
    for (const id of [...new Set(userIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    }
  }

  private async lockChallenge(tx: Tx, challengeId: string) {
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
  }

  /** Usa la transacción recibida o abre una propia. */
  private inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }

  /**
   * Reserva `stake` monedas de cada jugador de forma atómica: o se reservan ambas o
   * ninguna. Devuelve false si el reto ya tenía sus reservas (idempotente).
   * Si se pasa `tx`, corre dentro de esa transacción (para componerla con otros cambios).
   */
  async reservePot(
    challengeId: string,
    userIds: [string, string],
    stake: number,
    tx?: Tx,
  ): Promise<boolean> {
    this.assertPositive(stake);
    return this.inTx(tx, async (tx) => {
      await this.lockChallenge(tx, challengeId);
      await this.lockUsers(tx, userIds);

      const existing = await tx.walletTransaction.count({
        where: {
          idempotencyKey: { in: userIds.map((u) => WalletService.reserveKey(challengeId, u)) },
        },
      });
      if (existing > 0) return false;

      for (const userId of userIds) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.coinsAvailable < stake) {
          throw new InsufficientFundsException(userId, stake, user.coinsAvailable);
        }
      }
      for (const userId of userIds) {
        await tx.walletTransaction.create({
          data: {
            userId,
            challengeId,
            currency: 'COINS',
            type: 'RESERVE',
            amount: -stake,
            idempotencyKey: WalletService.reserveKey(challengeId, userId),
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { coinsAvailable: { decrement: stake }, coinsReserved: { increment: stake } },
        });
      }
      return true;
    });
  }

  /**
   * Liquida el pozo: el ganador recibe `2 * stake`; se libera la reserva de ambos.
   * Devuelve false si el reto ya había sido liquidado o reembolsado.
   */
  async settleWinner(
    challengeId: string,
    winnerId: string,
    loserId: string,
    stake: number,
    tx?: Tx,
  ): Promise<boolean> {
    this.assertPositive(stake);
    const run = this.inTx(tx, async (tx) => {
      await this.lockChallenge(tx, challengeId);
      await this.lockUsers(tx, [winnerId, loserId]);
      if (await this.alreadySettled(tx, challengeId)) return false;
      await this.assertReserved(tx, challengeId, [winnerId, loserId]);

      await tx.walletTransaction.create({
        data: {
          userId: winnerId,
          challengeId,
          currency: 'COINS',
          type: 'PAYOUT',
          amount: 2 * stake,
          idempotencyKey: WalletService.settleKey(challengeId, winnerId),
        },
      });
      await tx.user.update({
        where: { id: winnerId },
        data: { coinsAvailable: { increment: 2 * stake }, coinsReserved: { decrement: stake } },
      });

      // Asiento de cierre del perdedor: no cambia su saldo disponible, libera su reserva.
      await tx.walletTransaction.create({
        data: {
          userId: loserId,
          challengeId,
          currency: 'COINS',
          type: 'PAYOUT',
          amount: 0,
          idempotencyKey: WalletService.settleKey(challengeId, loserId),
        },
      });
      await tx.user.update({
        where: { id: loserId },
        data: { coinsReserved: { decrement: stake } },
      });
      return true;
    });
    // Con transacción externa un P2002 la abortaría igual; solo se traga si es propia.
    return tx ? run : run.catch((err) => this.swallowDuplicate(err));
  }

  /**
   * Devuelve `stake` a cada jugador (empate, cancelación, vencimiento).
   * Devuelve false si el reto ya había sido liquidado o reembolsado.
   */
  async refundPot(
    challengeId: string,
    userIds: [string, string],
    stake: number,
    tx?: Tx,
  ): Promise<boolean> {
    this.assertPositive(stake);
    const run = this.inTx(tx, async (tx) => {
      await this.lockChallenge(tx, challengeId);
      await this.lockUsers(tx, userIds);
      if (await this.alreadySettled(tx, challengeId)) return false;
      await this.assertReserved(tx, challengeId, userIds);

      for (const userId of userIds) {
        await tx.walletTransaction.create({
          data: {
            userId,
            challengeId,
            currency: 'COINS',
            type: 'REFUND',
            amount: stake,
            idempotencyKey: WalletService.settleKey(challengeId, userId),
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { coinsAvailable: { increment: stake }, coinsReserved: { decrement: stake } },
        });
      }
      return true;
    });
    return tx ? run : run.catch((err) => this.swallowDuplicate(err));
  }

  /**
   * Acredita monedas por una vía de emisión (bonos, premios). Idempotente por clave.
   * Devuelve true si este llamado efectivamente acreditó.
   */
  async credit(
    userId: string,
    type: Extract<WalletTxType, 'BONUS_INIT' | 'BONUS_WSP' | 'STREAK3' | 'REFERRAL' | 'JUDGE' | 'LIFELINE'>,
    amount: number,
    idempotencyKey: string,
    challengeId?: string,
    tx?: Tx,
  ): Promise<boolean> {
    this.assertPositive(amount);
    const run = this.inTx(tx, async (tx) => {
      await this.lockUsers(tx, [userId]);
      const exists = await tx.walletTransaction.findUnique({ where: { idempotencyKey } });
      if (exists) return false;
      await tx.walletTransaction.create({
        data: { userId, challengeId, currency: 'COINS', type, amount, idempotencyKey },
      });
      await tx.user.update({
        where: { id: userId },
        data: { coinsAvailable: { increment: amount } },
      });
      return true;
    });
    return tx ? run : run.catch((err) => this.swallowDuplicate(err));
  }

  /** Saldo disponible según el historial (para verificar consistencia). */
  async ledgerBalance(userId: string): Promise<number> {
    const agg = await this.prisma.walletTransaction.aggregate({
      where: { userId, currency: 'COINS' },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  /** Resumen del monedero del usuario: saldo, racha de constancia, salvavidas y últimos movimientos. */
  async getSummary(userId: string, now: Date = new Date()) {
    const [user, transactions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);

    const nextLifelineAt = user.lastLifelineAt
      ? new Date(user.lastLifelineAt.getTime() + LIFELINE_COOLDOWN_MS)
      : null;
    const cooldownOk = !nextLifelineAt || now >= nextLifelineAt;
    const lifelineEligible =
      user.coinsReserved === 0 &&
      user.coinsAvailable + user.coinsReserved < LIFELINE_THRESHOLD &&
      cooldownOk;

    return {
      coinsAvailable: user.coinsAvailable,
      coinsReserved: user.coinsReserved,
      streakDaysCount: user.streakDaysCount,
      lastCleanChallengeAt: user.lastCleanChallengeAt,
      lastLifelineAt: user.lastLifelineAt,
      lifelineEligible,
      lifelineNextAvailableAt: !cooldownOk ? nextLifelineAt : null,
      whatsappLinked: Boolean(user.whatsappPhone),
      paymentAlias: user.paymentAlias,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        challengeId: t.challengeId,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Salvavidas: +20 monedas gratis si el saldo total (disponible + reservado) es menor a 10,
   * no tiene monedas reservadas en retos activos y pasaron 24 h desde el último.
   * Se evalúa dentro de una transacción con el usuario bloqueado: pedidos simultáneos
   * no pueden cobrar dos veces.
   */
  async claimLifeline(userId: string, now: Date = new Date()): Promise<LifelineResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      if (user.coinsReserved > 0) {
        throw new LifelineNotAllowedException('HAS_RESERVED_COINS', 'Tenés monedas reservadas en retos activos.');
      }
      if (user.coinsAvailable + user.coinsReserved >= LIFELINE_THRESHOLD) {
        throw new LifelineNotAllowedException(
          'BALANCE_NOT_LOW',
          `El Salvavidas está disponible solo con menos de ${LIFELINE_THRESHOLD} monedas.`,
        );
      }
      if (user.lastLifelineAt) {
        const nextAt = new Date(user.lastLifelineAt.getTime() + LIFELINE_COOLDOWN_MS);
        if (now < nextAt) {
          throw new LifelineNotAllowedException(
            'COOLDOWN',
            'Ya usaste el Salvavidas en las últimas 24 horas.',
            nextAt,
          );
        }
      }

      await tx.walletTransaction.create({
        data: {
          userId,
          currency: 'COINS',
          type: 'LIFELINE',
          amount: LIFELINE_COINS,
          idempotencyKey: `lifeline:${userId}:${now.toISOString()}`,
        },
      });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { coinsAvailable: { increment: LIFELINE_COINS }, lastLifelineAt: now },
      });
      return {
        granted: LIFELINE_COINS,
        coinsAvailable: updated.coinsAvailable,
        nextAvailableAt: new Date(now.getTime() + LIFELINE_COOLDOWN_MS),
      };
    });
  }

  /**
   * Recompensa de +5 monedas al Juez que falla dentro de las 48 h de su designación.
   * No premia si el fallo llega tarde, si no es el Juez asignado del reto o si el Juez
   * es uno de los jugadores. Idempotente: un reto paga su recompensa una sola vez.
   */
  async rewardJudge(
    challengeId: string,
    judgeId: string,
    verdictAt: Date = new Date(),
    tx?: Tx,
  ): Promise<boolean> {
    const challenge = await (tx ?? this.prisma).challenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.judgeId !== judgeId || !challenge.judgeAssignedAt) return false;
    if (judgeId === challenge.creatorId || judgeId === challenge.opponentId) return false;

    const elapsed = verdictAt.getTime() - challenge.judgeAssignedAt.getTime();
    if (elapsed < 0 || elapsed > JUDGE_WINDOW_MS) return false;

    return this.credit(
      judgeId,
      'JUDGE',
      JUDGE_REWARD_COINS,
      `judge_reward:${challengeId}:${judgeId}`,
      challengeId,
      tx,
    );
  }

  // ---- helpers ----

  private assertPositive(n: number) {
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('El monto debe ser un entero positivo.');
    }
  }

  private async alreadySettled(tx: Tx, challengeId: string): Promise<boolean> {
    const n = await tx.walletTransaction.count({
      where: { challengeId, type: { in: ['PAYOUT', 'REFUND'] } },
    });
    return n > 0;
  }

  /** Antes de liquidar/reembolsar, ambos deben tener su reserva registrada. */
  private async assertReserved(tx: Tx, challengeId: string, userIds: string[]) {
    const n = await tx.walletTransaction.count({
      where: {
        type: 'RESERVE',
        idempotencyKey: { in: userIds.map((u) => WalletService.reserveKey(challengeId, u)) },
      },
    });
    if (n !== new Set(userIds).size) {
      throw new BadRequestException('El reto no tiene las monedas reservadas.');
    }
  }

  /** Una violación de unicidad concurrente significa "otro llamado ya lo hizo". */
  private swallowDuplicate(err: any): false {
    if (err?.code === 'P2002') return false;
    throw err;
  }
}

