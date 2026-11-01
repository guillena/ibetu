import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CLOCK_SCHEDULER, runClock } from '../clocks/clock-scheduler.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from './results.service.js';

export type ClockOutcome = 'DONE' | 'NOT_DUE' | 'NOT_ELIGIBLE' | 'NOT_FOUND';

export interface SweepResult {
  expired: number;
  silenced: number;
  judgesRevoked: number;
  failed: number;
}

const SWEEP_BATCH = 100;

/**
 * Los tres relojes del negocio. La base de datos es la fuente de verdad: cada función
 * bloquea el reto y vuelve a verificar estado y fechas antes de actuar, de modo que un
 * trabajo viejo, repetido, adelantado o ejecutado dos veces es inofensivo (idempotente).
 * El tiempo se inyecta (`now`) para poder simularlo en las pruebas.
 */
@Injectable()
export class ChallengeClocksService {
  private readonly logger = new Logger(ChallengeClocksService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ChallengeResultsService) private readonly results: ChallengeResultsService,
    @Optional() @Inject(CLOCK_SCHEDULER) private readonly clocks?: ClockScheduler,
  ) {}

  // ------------------------------------------------------- 1. vencimiento

  /**
   * Vence la fecha límite sin que nadie declare: el reto se cancela y se devuelve lo reservado.
   * Solo aplica a retos PENDIENTES o ACTIVOS (un reto con alguna declaración sigue su curso).
   */
  async expireChallenge(challengeId: string, now: Date = new Date()): Promise<ClockOutcome> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<ClockOutcome> => {
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const c = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!c) return 'NOT_FOUND';
      if (c.status !== 'PENDING' && c.status !== 'ACTIVE') return 'NOT_ELIGIBLE';
      if (c.expiresAt > now) return 'NOT_DUE';

      const refund = c.mode === 'COINS' && c.status === 'ACTIVE' && c.opponentId !== null;
      if (refund) {
        await this.wallet.refundPot(c.id, [c.creatorId, c.opponentId!], c.stakeAmount, tx);
      }
      await tx.challenge.update({ where: { id: c.id }, data: { status: 'CANCELLED', closedAt: now } });
      await tx.challengeEvent.create({
        data: {
          challengeId: c.id,
          actorId: null,
          eventType: 'CHALLENGE_EXPIRED',
          payload: { previousStatus: c.status, expiresAt: c.expiresAt.toISOString() },
        },
      });
      if (refund) {
        await tx.challengeEvent.create({
          data: {
            challengeId: c.id,
            actorId: null,
            eventType: 'COINS_REFUNDED',
            payload: { perPlayer: c.stakeAmount },
          },
        });
      }
      return 'DONE';
    });
    if (outcome === 'DONE') await this.clearClocks(challengeId);
    return outcome;
  }

  // ------------------------------------------------- 2. silencio de 24 horas

  /**
   * Pasaron 24 h desde la única declaración y el rival no respondió:
   *  - dijo "gané yo"        -> gana quien declaró (regla de la spec);
   *  - dijo "ganó mi rival"  -> gana el rival que calla (el declarante ya lo reconoció);
   *  - dijo "empate"         -> se devuelve el pozo (sin acuerdo no hay ganador).
   * No es una sanción: el silencio no afecta la Credibilidad.
   */
  async adjudicateSilence(challengeId: string, now: Date = new Date()): Promise<ClockOutcome> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<ClockOutcome> => {
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const c = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!c) return 'NOT_FOUND';
      const votes = Number(c.creatorVote !== null) + Number(c.opponentVote !== null);
      if (c.status !== 'RESULT' || votes !== 1 || !c.firstDeclaredAt || !c.opponentId) {
        return 'NOT_ELIGIBLE';
      }
      if (now.getTime() < c.firstDeclaredAt.getTime() + SILENCE_WINDOW_MS) return 'NOT_DUE';

      const voterIsCreator = c.creatorVote !== null;
      const vote = (voterIsCreator ? c.creatorVote : c.opponentVote)!;
      const voterId = voterIsCreator ? c.creatorId : c.opponentId;
      const silentId = voterIsCreator ? c.opponentId : c.creatorId;
      const winnerId = vote === 'WIN' ? voterId : vote === 'LOSS' ? silentId : null;

      await tx.challengeEvent.create({
        data: {
          challengeId: c.id,
          actorId: null,
          eventType: 'SILENCE_TIMEOUT',
          payload: { voterId, vote, silentPlayerId: silentId, winnerId },
        },
      });
      await this.results.closeBySystem(tx, c, winnerId, now);
      return 'DONE';
    });
    if (outcome === 'DONE') await this.clearClocks(challengeId);
    return outcome;
  }

  // ------------------------------------------------------ 3. Juez, 48 horas

  /**
   * El Juez no falló dentro de sus 48 h: se revoca su asignación y los jugadores pueden
   * proponer y aprobar a otro. La disputa y las monedas reservadas siguen como estaban.
   */
  async revokeExpiredJudge(challengeId: string, now: Date = new Date()): Promise<ClockOutcome> {
    return this.prisma.$transaction(async (tx): Promise<ClockOutcome> => {
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const c = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!c) return 'NOT_FOUND';
      if (c.status !== 'DISPUTE' || !c.judgeId || !c.judgeAssignedAt) return 'NOT_ELIGIBLE';
      if (now.getTime() < c.judgeAssignedAt.getTime() + JUDGE_WINDOW_MS) return 'NOT_DUE';

      await tx.challenge.update({
        where: { id: c.id },
        data: {
          judgeId: null,
          judgeProposedById: null,
          judgeApprovedByCreator: false,
          judgeApprovedByOpponent: false,
          judgeAssignedAt: null,
        },
      });
      await tx.challengeEvent.create({
        data: {
          challengeId: c.id,
          actorId: null,
          eventType: 'JUDGE_EXPIRED',
          payload: { judgeId: c.judgeId, assignedAt: c.judgeAssignedAt.toISOString() },
        },
      });
      return 'DONE';
    });
  }

  // ----------------------------------------------------- barrido periódico

  /**
   * Red de seguridad: busca en la base todo lo vencido y ejecuta el reloj que corresponde.
   * Corrige relojes perdidos (Redis reiniciado, fallo al agendar) y adelantados.
   * `onlyIds` acota el barrido (útil para pruebas y operaciones puntuales).
   */
  async sweepOverdue(now: Date = new Date(), onlyIds?: string[]): Promise<SweepResult> {
    const scope = onlyIds ? { id: { in: onlyIds } } : {};
    const result: SweepResult = { expired: 0, silenced: 0, judgesRevoked: 0, failed: 0 };

    const run = async (ids: string[], fn: (id: string) => Promise<ClockOutcome>, onDone: () => void) => {
      for (const id of ids) {
        try {
          if ((await fn(id)) === 'DONE') onDone();
        } catch (err) {
          result.failed++;
          this.logger.error(`El barrido falló con el reto ${id}`, err as Error);
        }
      }
    };

    const ids = async (where: object) =>
      (await this.prisma.challenge.findMany({ where: { ...scope, ...where }, select: { id: true }, take: SWEEP_BATCH }))
        .map((c) => c.id);

    await run(
      await ids({ status: { in: ['PENDING', 'ACTIVE'] }, expiresAt: { lte: now } }),
      (id) => this.expireChallenge(id, now),
      () => result.expired++,
    );
    await run(
      await ids({ status: 'RESULT', firstDeclaredAt: { lte: new Date(now.getTime() - SILENCE_WINDOW_MS) } }),
      (id) => this.adjudicateSilence(id, now),
      () => result.silenced++,
    );
    await run(
      await ids({ status: 'DISPUTE', judgeAssignedAt: { lte: new Date(now.getTime() - JUDGE_WINDOW_MS) } }),
      (id) => this.revokeExpiredJudge(id, now),
      () => result.judgesRevoked++,
    );
    return result;
  }

  /** Quita del agendador los relojes que dejaron de tener sentido tras un cierre. */
  private async clearClocks(challengeId: string) {
    await runClock(this.clocks, this.logger, (clocks) => clocks.cancelAll(challengeId));
  }
}

