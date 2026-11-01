import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Challenge } from '@prisma/client';
import { CLOCK_SCHEDULER, runClock } from '../clocks/clock-scheduler.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { ChallengeResultsService } from './results.service.js';

export interface JudgeStatus {
  challengeId: string;
  judgeId: string | null;
  proposedById: string | null;
  /** true cuando ambos jugadores aprobaron y el Juez ya puede fallar. */
  assigned: boolean;
  /** Fin del plazo de 48 h del Juez (solo si ya está asignado). */
  verdictDeadline: Date | null;
}

export interface VerdictResult {
  challengeId: string;
  status: 'CLOSED';
  winnerId: string;
  judgeRewarded: boolean;
}

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(FriendsService) private readonly friends: FriendsService,
    @Inject(ChallengeResultsService) private readonly results: ChallengeResultsService,
    @Optional() @Inject(CLOCK_SCHEDULER) private readonly clocks?: ClockScheduler,
  ) {}

  /**
   * Un jugador propone a un tercer amigo como Juez. Su propuesta cuenta como su
   * aprobación; falta la del rival. Una nueva propuesta reemplaza a la pendiente
   * (así el rival puede contraproponer a otra persona).
   */
  async propose(challengeId: string, actorId: string, judgeId: string): Promise<JudgeStatus> {
    return this.prisma.$transaction(async (tx) => {
      const c = await this.lockAndLoad(tx, challengeId);
      this.assertPlayer(c, actorId);
      this.assertDispute(c);
      if (c.judgeAssignedAt) {
        throw new ConflictException({
          code: 'JUDGE_ALREADY_ASSIGNED',
          message: 'Ya hay un Juez asignado a esta disputa.',
        });
      }
      if (!judgeId || typeof judgeId !== 'string') {
        throw new BadRequestException('Falta el Juez propuesto.');
      }
      if (judgeId === c.creatorId || judgeId === c.opponentId) {
        throw new BadRequestException('El Juez no puede ser uno de los jugadores.');
      }
      const judge = await tx.user.findUnique({ where: { id: judgeId } });
      if (!judge) throw new NotFoundException('El Juez propuesto no existe.');
      const friends = await this.friends.listFriends(actorId);
      if (!friends.some((f) => f.id === judgeId)) {
        throw new ForbiddenException('Solo podés proponer como Juez a un amigo tuyo.');
      }

      const proposerIsCreator = actorId === c.creatorId;
      const updated = await tx.challenge.update({
        where: { id: c.id },
        data: {
          judgeId,
          judgeProposedById: actorId,
          judgeApprovedByCreator: proposerIsCreator,
          judgeApprovedByOpponent: !proposerIsCreator,
          judgeAssignedAt: null,
        },
      });
      await tx.challengeEvent.create({
        data: { challengeId: c.id, actorId, eventType: 'JUDGE_PROPOSED', payload: { judgeId } },
      });
      return this.status(updated);
    });
  }

  /** El rival de quien propuso aprueba al Juez: queda asignado y corren sus 48 h. */
  async approve(challengeId: string, actorId: string, now: Date = new Date()): Promise<JudgeStatus> {
    const status = await this.prisma.$transaction(async (tx) => {
      const c = await this.lockAndLoad(tx, challengeId);
      this.assertPlayer(c, actorId);
      this.assertDispute(c);
      if (!c.judgeId || c.judgeAssignedAt) {
        throw new ConflictException({
          code: 'NO_PENDING_PROPOSAL',
          message: 'No hay un Juez propuesto esperando tu aprobación.',
        });
      }
      if (actorId === c.judgeProposedById) {
        throw new ForbiddenException('La aprobación tiene que darla tu rival, no quien propuso al Juez.');
      }

      const updated = await tx.challenge.update({
        where: { id: c.id },
        data: { judgeApprovedByCreator: true, judgeApprovedByOpponent: true, judgeAssignedAt: now },
      });
      await tx.challengeEvent.create({
        data: {
          challengeId: c.id,
          actorId,
          eventType: 'JUDGE_ASSIGNED',
          payload: {
            judgeId: c.judgeId,
            assignedAt: now.toISOString(),
            verdictDeadline: new Date(now.getTime() + JUDGE_WINDOW_MS).toISOString(),
          },
        },
      });
      return this.status(updated);
    });

    // Con el Juez asignado corren sus 48 h: si no falla, se revoca su asignación.
    if (status.verdictDeadline) {
      const deadline = status.verdictDeadline;
      await runClock(this.clocks, this.logger, (clocks) => clocks.scheduleJudge(challengeId, deadline));
    }
    return status;
  }

  /**
   * Fallo definitivo del Juez: solo el Juez asignado, dentro de sus 48 h. Cierra el reto,
   * liquida a favor del ganador y acredita al Juez su recompensa, todo en una transacción.
   */
  async verdict(
    challengeId: string,
    actorId: string,
    winnerId: string,
    now: Date = new Date(),
  ): Promise<VerdictResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const c = await this.lockAndLoad(tx, challengeId);
      if (!c.judgeId || !c.judgeAssignedAt || actorId !== c.judgeId) {
        throw new ForbiddenException('Solo el Juez asignado a esta disputa puede dar el fallo.');
      }
      this.assertDispute(c);
      if (now.getTime() > c.judgeAssignedAt.getTime() + JUDGE_WINDOW_MS) {
        throw new ConflictException({
          code: 'JUDGE_WINDOW_EXPIRED',
          message: 'Se venció el plazo de 48 horas del Juez.',
        });
      }
      if (winnerId !== c.creatorId && winnerId !== c.opponentId) {
        throw new BadRequestException('El ganador tiene que ser uno de los dos jugadores.');
      }

      // Candados de usuario por adelantado y en orden fijo, antes de los asientos que los
      // referencian: evita bloqueos cruzados entre cierres simultáneos del mismo jugador o Juez.
      for (const id of [c.creatorId, c.opponentId, actorId].filter((x): x is string => x !== null).sort()) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      }
      await tx.challengeEvent.create({
        data: { challengeId: c.id, actorId, eventType: 'JUDGE_VERDICT', payload: { winnerId } },
      });
      await this.results.closeByJudge(tx, c, winnerId, actorId, now);
      const judgeRewarded = await this.wallet.rewardJudge(c.id, actorId, now, tx);
      return { challengeId: c.id, status: 'CLOSED' as const, winnerId, judgeRewarded };
    });

    await runClock(this.clocks, this.logger, (clocks) => clocks.cancelAll(challengeId));
    return result;
  }

  /** Estado de la designación del Juez, visible para los jugadores y el propio Juez. */
  async getStatus(challengeId: string, actorId: string): Promise<JudgeStatus> {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) throw new NotFoundException('El reto no existe.');
    if (![c.creatorId, c.opponentId, c.judgeId].includes(actorId)) {
      throw new ForbiddenException('Solo los jugadores y el Juez pueden ver esta información.');
    }
    return this.status(c);
  }

  // ---- helpers ----

  private async lockAndLoad(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], id: string) {
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${id} FOR UPDATE`;
    const c = await tx.challenge.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('El reto no existe.');
    return c;
  }

  private assertPlayer(c: Challenge, actorId: string) {
    if (actorId !== c.creatorId && actorId !== c.opponentId) {
      throw new ForbiddenException('Solo los jugadores del reto pueden hacer esto.');
    }
  }

  private assertDispute(c: Challenge) {
    if (c.status !== 'DISPUTE') {
      throw new ConflictException({
        code: 'NOT_IN_DISPUTE',
        message: 'El reto no está en disputa.',
        status: c.status,
      });
    }
  }

  private status(c: Challenge): JudgeStatus {
    return {
      challengeId: c.id,
      judgeId: c.judgeId,
      proposedById: c.judgeProposedById,
      assigned: c.judgeAssignedAt !== null,
      verdictDeadline: c.judgeAssignedAt ? new Date(c.judgeAssignedAt.getTime() + JUDGE_WINDOW_MS) : null,
    };
  }
}

