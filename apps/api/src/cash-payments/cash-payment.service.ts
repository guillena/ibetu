import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CashPaymentStatus, Prisma } from '@prisma/client';
import { recordCredibilityEvent } from '../credibility/credibility.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Plazo para que el perdedor pague antes de que el ganador pueda reclamar incumplimiento. */
export const CASH_PAYMENT_GRACE_MS =
  Number(process.env.CASH_PAYMENT_GRACE_HOURS ?? 72) * 60 * 60 * 1000;

export type CashPaymentAction = 'MARK_PAID' | 'CONFIRM_RECEIVED' | 'CLAIM_DEFAULT';

export interface CashPaymentInfo {
  challengeId: string;
  status: CashPaymentStatus;
  amount: number;
  role: 'WINNER' | 'LOSER';
  winner: { id: string; username: string; displayName: string };
  loser: { id: string; username: string; displayName: string };
  /** Alias/CBU del ganador al que debe transferir el perdedor (null si aún no lo cargó). */
  payTo: string | null;
  /** A partir de cuándo el ganador puede reclamar incumplimiento. */
  defaultClaimableAt: Date | null;
  allowedActions: CashPaymentAction[];
}

@Injectable()
export class CashPaymentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Alias o CBU donde el usuario recibe pagos de retos por Plata. */
  async setPaymentAlias(userId: string, alias: string): Promise<{ paymentAlias: string }> {
    const clean = (alias ?? '').trim();
    // eslint-disable-next-line no-control-regex
    if (clean.length < 3 || clean.length > 60 || /[\u0000-\u001f]/.test(clean)) {
      throw new BadRequestException('El alias debe tener entre 3 y 60 caracteres.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { paymentAlias: clean } });
    return { paymentAlias: clean };
  }

  /** Datos del acuerdo de pago, visibles solo para los dos jugadores. */
  async getPaymentInfo(challengeId: string, actorId: string, now: Date = new Date()): Promise<CashPaymentInfo> {
    const { challenge, winner, loser } = await this.loadPayableChallenge(challengeId);
    const role = this.roleOf(actorId, winner.id, loser.id);
    const defaultClaimableAt = challenge.closedAt
      ? new Date(challenge.closedAt.getTime() + CASH_PAYMENT_GRACE_MS)
      : null;

    const allowedActions: CashPaymentAction[] = [];
    const status = challenge.cashPaymentStatus;
    if (role === 'LOSER' && status === 'PENDING') allowedActions.push('MARK_PAID');
    if (role === 'WINNER' && (status === 'PENDING' || status === 'PAID_CLAIMED')) {
      allowedActions.push('CONFIRM_RECEIVED');
      if (defaultClaimableAt && now >= defaultClaimableAt) allowedActions.push('CLAIM_DEFAULT');
    }

    return {
      challengeId,
      status,
      amount: challenge.stakeAmount,
      role,
      winner: this.publicUser(winner),
      loser: this.publicUser(loser),
      payTo: winner.paymentAlias ?? null,
      defaultClaimableAt,
      allowedActions,
    };
  }

  /** El perdedor avisa "Ya transferí": PENDING -> PAID_CLAIMED. */
  async markPaid(challengeId: string, actorId: string) {
    const { winner, loser } = await this.loadPayableChallenge(challengeId);
    if (this.roleOf(actorId, winner.id, loser.id) !== 'LOSER') {
      throw new ForbiddenException('Solo quien perdió el reto puede marcar el pago como realizado.');
    }
    return this.transition(challengeId, ['PENDING'], 'PAID_CLAIMED', actorId, 'CASH_PAYMENT_PAID_CLAIMED');
  }

  /** El ganador confirma "Pago recibido": PENDING | PAID_CLAIMED -> CONFIRMED. */
  async confirmReceived(challengeId: string, actorId: string) {
    const { winner, loser } = await this.loadPayableChallenge(challengeId);
    if (this.roleOf(actorId, winner.id, loser.id) !== 'WINNER') {
      throw new ForbiddenException('Solo quien ganó el reto puede confirmar la recepción del pago.');
    }
    return this.transition(
      challengeId,
      ['PENDING', 'PAID_CLAIMED'],
      'CONFIRMED',
      actorId,
      'CASH_PAYMENT_CONFIRMED',
    );
  }

  /**
   * El ganador reclama incumplimiento: PENDING | PAID_CLAIMED -> DEFAULTED, solo una vez
   * vencido el plazo de gracia. Este estado alimenta la penalización de Credibilidad
   * del deudor (tarea 5.1).
   */
  async claimDefault(challengeId: string, actorId: string, now: Date = new Date()) {
    const { challenge, winner, loser } = await this.loadPayableChallenge(challengeId);
    if (this.roleOf(actorId, winner.id, loser.id) !== 'WINNER') {
      throw new ForbiddenException('Solo quien ganó el reto puede reclamar un incumplimiento.');
    }
    const claimableAt = new Date((challenge.closedAt ?? now).getTime() + CASH_PAYMENT_GRACE_MS);
    if (now < claimableAt) {
      throw new ConflictException({
        code: 'GRACE_PERIOD_ACTIVE',
        message: 'Todavía no venció el plazo para que el rival pague.',
        defaultClaimableAt: claimableAt,
      });
    }
    return this.transition(
      challengeId,
      ['PENDING', 'PAID_CLAIMED'],
      'DEFAULTED',
      actorId,
      'CASH_PAYMENT_DEFAULTED',
      // Incumplimiento comprobado del deudor: baja su Credibilidad en la misma transacción.
      (tx) =>
        recordCredibilityEvent(tx, { userId: loser.id, challengeId, type: 'PAYMENT_DEFAULT' }).then(
          () => undefined,
        ),
    );
  }

  // ---- helpers ----

  /**
   * Cambio de estado atómico (compare-and-set): solo avanza si el acuerdo sigue en uno de
   * los estados de origen, así dos acciones simultáneas no pueden pisarse.
   * `after` corre dentro de la misma transacción (si falla, el cambio se revierte).
   */
  private async transition(
    challengeId: string,
    from: CashPaymentStatus[],
    to: CashPaymentStatus,
    actorId: string,
    eventType: string,
    after?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.challenge.updateMany({
        where: { id: challengeId, cashPaymentStatus: { in: from } },
        data: { cashPaymentStatus: to },
      });
      if (count === 0) {
        const current = await tx.challenge.findUniqueOrThrow({ where: { id: challengeId } });
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: 'El acuerdo de pago ya no admite esta acción.',
          status: current.cashPaymentStatus,
        });
      }
      await tx.challengeEvent.create({
        data: { challengeId, actorId, eventType, payload: { from, to } },
      });
      if (after) await after(tx);
      return { challengeId, status: to };
    });
  }

  private async loadPayableChallenge(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { creator: true, opponent: true },
    });
    if (!challenge) throw new NotFoundException('El reto no existe.');
    if (challenge.mode !== 'CASH') {
      throw new BadRequestException('Este reto no es en modo Plata.');
    }
    if (challenge.status !== 'CLOSED' || !challenge.winnerId || !challenge.opponent) {
      throw new BadRequestException('El reto todavía no se cerró con un ganador.');
    }
    const winner = challenge.winnerId === challenge.creatorId ? challenge.creator : challenge.opponent;
    const loser = challenge.winnerId === challenge.creatorId ? challenge.opponent : challenge.creator;
    return { challenge, winner, loser };
  }

  private roleOf(actorId: string, winnerId: string, loserId: string): 'WINNER' | 'LOSER' {
    if (actorId === winnerId) return 'WINNER';
    if (actorId === loserId) return 'LOSER';
    throw new ForbiddenException('Solo los jugadores del reto pueden ver o modificar el pago.');
  }

  private publicUser(u: { id: string; username: string; displayName: string }) {
    return { id: u.id, username: u.username, displayName: u.displayName };
  }
}

