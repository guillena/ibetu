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
import type { Challenge, ChallengeStatus, Vote } from '@prisma/client';
import { CLOCK_SCHEDULER, runClock } from '../clocks/clock-scheduler.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { recordCredibilityEvent } from '../credibility/credibility.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { evaluateVotes } from './votes.js';
import type { Resolution } from './votes.js';

export const SILENCE_WINDOW_MS = 24 * 60 * 60 * 1000;
const VOTES: Vote[] = ['WIN', 'LOSS', 'DRAW'];
const VOTING_STATES: ChallengeStatus[] = ['ACTIVE', 'RESULT', 'DISPUTE'];

/** Cliente de transacción interactiva de Prisma. */
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface DeclareResult {
  challengeId: string;
  status: ChallengeStatus;
  yourVote: Vote;
  /** Antes de que ambos voten solo se informa si el rival ya votó, no qué votó. */
  rivalHasVoted: boolean;
  /** Visible solo cuando ambos votaron (resultado o disputa). */
  rivalVote: Vote | null;
  winnerId: string | null;
  outcome: 'WAITING' | 'WIN' | 'DRAW' | 'DISPUTE';
  /** Si solo uno votó, cuándo vence el plazo de silencio de 24 h. */
  silenceDeadline: Date | null;
  changed: boolean;
}

@Injectable()
export class ChallengeResultsService {
  private readonly logger = new Logger(ChallengeResultsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(StreakService) private readonly streak: StreakService,
    @Optional() @Inject(CLOCK_SCHEDULER) private readonly clocks?: ClockScheduler,
  ) {}

  /**
   * Declara (o cambia) el voto de un jugador. Todo ocurre en una transacción con el reto
   * bloqueado: dos votos simultáneos se serializan y el cierre (estado, liquidación o
   * reembolso, constancia y bitácora) es atómico.
   */
  async declare(challengeId: string, actorId: string, vote: Vote, now: Date = new Date()): Promise<DeclareResult> {
    if (!VOTES.includes(vote)) {
      throw new BadRequestException('El voto debe ser WIN, LOSS o DRAW.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const c = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!c) throw new NotFoundException('El reto no existe.');

      const isCreator = actorId === c.creatorId;
      const isOpponent = actorId === c.opponentId;
      if (!isCreator && !isOpponent) {
        throw new ForbiddenException('Solo los jugadores del reto pueden declarar el resultado.');
      }
      if (!VOTING_STATES.includes(c.status)) {
        throw new ConflictException({
          code: 'VOTING_CLOSED',
          message: 'El reto ya no admite declaraciones.',
          status: c.status,
        });
      }
      // Pasada la fecha límite sin ninguna declaración, el reto se cancela (reloj de la tarea 4.5).
      if (c.status === 'ACTIVE' && c.expiresAt <= now) {
        throw new ConflictException({ code: 'EXPIRED', message: 'El plazo para declarar el reto venció.' });
      }

      const previous = isCreator ? c.creatorVote : c.opponentVote;
      if (previous === vote) {
        return this.view(c, actorId, false); // mismo voto: sin cambios ni asientos
      }

      // Orden global de candados: reto -> usuarios (ordenados). Se toman ANTES de escribir
      // asientos que referencian al usuario: un FK toma un candado débil sobre su fila y, si
      // luego el cierre pidiera uno fuerte, dos cierres del mismo jugador se bloquearían entre sí.
      await this.lockPlayers(tx, c);

      const creatorVote = isCreator ? vote : c.creatorVote;
      const opponentVote = isOpponent ? vote : c.opponentVote;
      const resolution = evaluateVotes(creatorVote, opponentVote);
      const votesCount = Number(creatorVote !== null) + Number(opponentVote !== null);

      // El reloj de silencio corre desde la primera declaración; si el único votante cambia
      // su voto, el reloj se reinicia para que no se adjudique con un voto ya abandonado.
      const firstDeclaredAt = votesCount === 1 || c.firstDeclaredAt === null ? now : c.firstDeclaredAt;

      await tx.challengeEvent.create({
        data: {
          challengeId: c.id,
          actorId,
          eventType: 'RESULT_DECLARED',
          payload: { vote, previous },
        },
      });

      let updated: Challenge;
      switch (resolution.kind) {
        case 'WAITING':
          updated = await tx.challenge.update({
            where: { id: c.id },
            data: { creatorVote, opponentVote, status: 'RESULT', firstDeclaredAt },
          });
          break;
        case 'DISPUTE': {
          if (c.status !== 'DISPUTE') {
            await tx.challengeEvent.create({
              data: { challengeId: c.id, actorId, eventType: 'DISPUTE_OPENED', payload: { creatorVote, opponentVote } },
            });
          }
          updated = await tx.challenge.update({
            where: { id: c.id },
            data: { creatorVote, opponentVote, status: 'DISPUTE', firstDeclaredAt },
          });
          break;
        }
        default:
          updated = await this.close(tx, c, creatorVote, opponentVote, resolution, now, actorId);
      }
      return this.view(updated, actorId, true);
    });

    await this.syncClocks(challengeId, result);
    return result;
  }

  /**
   * Mantiene los relojes alineados con el estado del reto, ya confirmado en la base:
   *  - una sola declaración (RESULT): corre el reloj de 24 h y deja de importar el vencimiento;
   *  - ambos votaron y hay disputa: ya no corre ninguno de los dos;
   *  - cierre: se cancela todo.
   */
  private async syncClocks(challengeId: string, r: DeclareResult) {
    if (!r.changed) return;
    await runClock(this.clocks, this.logger, async (clocks) => {
      if (r.status === 'RESULT' && r.silenceDeadline) {
        await clocks.cancelExpire(challengeId);
        await clocks.scheduleSilence(challengeId, r.silenceDeadline);
      } else if (r.status === 'DISPUTE') {
        await clocks.cancelExpire(challengeId);
        await clocks.cancelSilence(challengeId);
      } else if (r.status === 'CLOSED') {
        await clocks.cancelAll(challengeId);
      }
    });
  }

  /**
   * Cierra el reto con el fallo definitivo del Juez, dentro de la transacción recibida.
   * Reutiliza el mismo cierre que el acuerdo entre jugadores (liquidación o cobro por
   * fuera, estadísticas, constancia y bitácora).
   */
  async closeByJudge(tx: Tx, c: Challenge, winnerId: string, judgeId: string, now: Date): Promise<Challenge> {
    const winner = winnerId === c.creatorId ? ('CREATOR' as const) : ('OPPONENT' as const);
    return this.close(tx, c, c.creatorVote, c.opponentVote, { kind: 'WIN', winner }, now, judgeId, 'JUDGE');
  }

  /**
   * Cierre automático por el sistema (silencio de 24 h): adjudica al ganador, o devuelve
   * el pozo si `winnerId` es null. No es una sanción: no afecta la Credibilidad.
   */
  async closeBySystem(tx: Tx, c: Challenge, winnerId: string | null, now: Date): Promise<Challenge> {
    const resolution = winnerId
      ? ({ kind: 'WIN', winner: winnerId === c.creatorId ? 'CREATOR' : 'OPPONENT' } as const)
      : ({ kind: 'DRAW' } as const);
    return this.close(tx, c, c.creatorVote, c.opponentVote, resolution, now, null, 'TIMEOUT');
  }

  /** Cierra el reto: liquida o reembolsa, actualiza estadísticas y constancia. */
  private async close(
    tx: Tx,
    c: Challenge,
    creatorVote: Vote | null,
    opponentVote: Vote | null,
    resolution: Extract<Resolution, { kind: 'WIN' | 'DRAW' }>,
    now: Date,
    actorId: string | null,
    resolvedBy: 'AGREEMENT' | 'JUDGE' | 'TIMEOUT' = 'AGREEMENT',
  ): Promise<Challenge> {
    const opponentId = c.opponentId!;
    const winnerId =
      resolution.kind === 'WIN' ? (resolution.winner === 'CREATOR' ? c.creatorId : opponentId) : null;
    const loserId = winnerId ? (winnerId === c.creatorId ? opponentId : c.creatorId) : null;
    // Si el reto llegó a disputa en algún momento, no cuenta como "reto limpio".
    const hadDispute =
      c.status === 'DISPUTE' ||
      (await tx.challengeEvent.count({ where: { challengeId: c.id, eventType: 'DISPUTE_OPENED' } })) > 0;

    if (c.mode === 'COINS') {
      if (winnerId && loserId) {
        await this.wallet.settleWinner(c.id, winnerId, loserId, c.stakeAmount, tx);
        await tx.challengeEvent.create({
          data: { challengeId: c.id, actorId, eventType: 'COINS_SETTLED', payload: { winnerId, pot: c.stakeAmount * 2 } },
        });
      } else {
        await this.wallet.refundPot(c.id, [c.creatorId, opponentId], c.stakeAmount, tx);
        await tx.challengeEvent.create({
          data: { challengeId: c.id, actorId, eventType: 'COINS_REFUNDED', payload: { perPlayer: c.stakeAmount } },
        });
      }
    }

    const updated = await tx.challenge.update({
      where: { id: c.id },
      data: {
        creatorVote,
        opponentVote,
        status: 'CLOSED',
        winnerId,
        closedAt: now,
        // Plata: el ganador cobra por fuera; arranca el acuerdo de pago entre amigos.
        ...(c.mode === 'CASH' && winnerId ? { cashPaymentStatus: 'PENDING' as const } : {}),
      },
    });

    // Estadísticas simples: jugados para ambos, victorias solo para el ganador.
    for (const id of [c.creatorId, opponentId].sort()) {
      await tx.user.update({
        where: { id },
        data: { totalPlayed: { increment: 1 }, ...(id === winnerId ? { totalWins: { increment: 1 } } : {}) },
      });
    }

    await tx.challengeEvent.create({
      data: {
        challengeId: c.id,
        actorId,
        eventType: 'CHALLENGE_CLOSED',
        payload: {
          outcome: resolution.kind,
          winnerId,
          loserId,
          resolvedBy,
          hadDispute,
          creatorVote,
          opponentVote,
          ...(resolvedBy === 'JUDGE' ? { judgeId: actorId } : {}),
        },
      },
    });

    await this.streak.onChallengeClosed(
      {
        userIds: [c.creatorId, opponentId],
        outcome: resolution.kind === 'WIN' ? 'WIN' : 'DRAW',
        hadDispute,
        closedAt: now,
      },
      tx,
    );

    await this.recordCredibility(tx, {
      challengeId: c.id,
      players: [c.creatorId, opponentId],
      loserId,
      loserVote: loserId === c.creatorId ? creatorVote : opponentVote,
      resolvedBy,
      hadDispute,
    });
    return updated;
  }

  /**
   * Credibilidad según cómo se cerró el reto:
   *  - de común acuerdo y sin disputa (ganes o pierdas) -> acuerdo limpio para ambos;
   *  - silencio de 24 h                                 -> neutro (la sanción ya fue perder el reto);
   *  - disputa resuelta por rectificación                -> neutro (hubo disputa, no hay culpable);
   *  - fallo del Juez                                    -> incumplimiento solo del jugador cuya
   *    victoria declarada fue desmentida (perdedor que había dicho "gané yo").
   */
  private async recordCredibility(
    tx: Tx,
    f: {
      challengeId: string;
      players: [string, string];
      loserId: string | null;
      loserVote: Vote | null;
      resolvedBy: 'AGREEMENT' | 'JUDGE' | 'TIMEOUT';
      hadDispute: boolean;
    },
  ) {
    if (f.resolvedBy === 'AGREEMENT' && !f.hadDispute) {
      for (const userId of [...f.players].sort()) {
        await recordCredibilityEvent(tx, { userId, challengeId: f.challengeId, type: 'CLEAN_AGREEMENT' });
      }
    } else if (f.resolvedBy === 'JUDGE' && f.loserId && f.loserVote === 'WIN') {
      await recordCredibilityEvent(tx, {
        userId: f.loserId,
        challengeId: f.challengeId,
        type: 'DISPUTE_LOST',
      });
    }
  }

  /** Bloquea a los dos jugadores en orden fijo (evita bloqueos cruzados entre cierres). */
  private async lockPlayers(tx: Tx, c: Challenge) {
    const ids = [c.creatorId, c.opponentId].filter((id): id is string => id !== null).sort();
    for (const id of ids) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    }
  }

  private view(c: Challenge, actorId: string, changed: boolean): DeclareResult {
    const isCreator = actorId === c.creatorId;
    const yourVote = (isCreator ? c.creatorVote : c.opponentVote) as Vote;
    const rivalVote = isCreator ? c.opponentVote : c.creatorVote;
    const bothVoted = c.creatorVote !== null && c.opponentVote !== null;
    const resolution = evaluateVotes(c.creatorVote, c.opponentVote);
    return {
      challengeId: c.id,
      status: c.status,
      yourVote,
      rivalHasVoted: rivalVote !== null,
      rivalVote: bothVoted ? rivalVote : null,
      winnerId: c.winnerId,
      outcome: resolution.kind === 'WAITING' ? 'WAITING' : resolution.kind,
      silenceDeadline:
        c.status === 'RESULT' && c.firstDeclaredAt
          ? new Date(c.firstDeclaredAt.getTime() + SILENCE_WINDOW_MS)
          : null,
      changed,
    };
  }
}

