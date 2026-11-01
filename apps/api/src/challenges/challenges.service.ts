import { randomBytes } from 'node:crypto';
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
import type { Challenge, ChallengeMode } from '@prisma/client';
import { CLOCK_SCHEDULER, runClock } from '../clocks/clock-scheduler.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { buildView } from '../credibility/credibility.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { SILENCE_WINDOW_MS } from './results.service.js';

export const TITLE_MAX = 140;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Ideas pre-armadas de un toque para crear un reto más rápido. */
export const CHALLENGE_PRESETS = [
  { id: 'paper-basket', label: 'Emboque de papel', text: '¿A que no embocás el papel en el cesto de 5 metros al primer intento?' },
  { id: 'corner-kick', label: 'Pique a la esquina', text: '¿A que no llegás primero a la esquina?' },
  { id: 'ping-pong', label: '1v1 Ping Pong', text: 'Partido de Ping Pong 1v1 al mejor de 3 sets.' },
  { id: 'pizza', label: 'Mejor Pizza Casera', text: '¿Quién prepara la mejor pizza casera?' },
  { id: 'pushups', label: '30 flexiones', text: '¿Quién hace 30 flexiones más rápido?' },
  { id: 'fifa', label: 'FIFA 1v1', text: 'Partida de FIFA 1v1 sin repetir equipo.' },
] as const;

export interface CreateChallengeInput {
  title?: string;
  presetId?: string;
  /** Amigo al que se desafía; si se omite, el reto queda abierto para un link de WhatsApp. */
  opponentId?: string;
  mode?: ChallengeMode;
  stakeAmount: number;
  expiresAt: string | Date;
}

export interface ChallengeView {
  id: string;
  inviteCode: string;
  title: string;
  status: Challenge['status'];
  mode: ChallengeMode;
  stakeAmount: number;
  creatorId: string;
  opponentId: string | null;
  expiresAt: Date;
  shareUrl: string;
  whatsappShareUrl: string;
}

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(FriendsService) private readonly friends: FriendsService,
    @Optional() @Inject(CLOCK_SCHEDULER) private readonly clocks?: ClockScheduler,
  ) {}

  listPresets() {
    return CHALLENGE_PRESETS;
  }

  /** Vista pública del reto por código de invitación (para la página /r/[code] y sus metadatos OG). */
  async getByInviteCode(inviteCode: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { inviteCode },
      include: {
        creator: true,
        opponent: true,
      },
    });
    if (!challenge) throw new NotFoundException('La invitación no existe.');

    const creatorCred = buildView(challenge.creator);
    const opponentCred = challenge.opponent ? buildView(challenge.opponent) : null;
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      id: challenge.id,
      inviteCode: challenge.inviteCode,
      title: challenge.title,
      status: challenge.status,
      mode: challenge.mode,
      stakeAmount: challenge.stakeAmount,
      pot: challenge.mode === 'COINS' ? challenge.stakeAmount * 2 : null,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
      shareUrl: `${base}/r/${challenge.inviteCode}`,
      creator: {
        id: challenge.creator.id,
        username: challenge.creator.username,
        displayName: challenge.creator.displayName,
        credibility: {
          score: creatorCred.score,
          band: creatorCred.band,
          provisional: creatorCred.provisional,
        },
      },
      opponent: challenge.opponent
        ? {
            id: challenge.opponent.id,
            username: challenge.opponent.username,
            displayName: challenge.opponent.displayName,
            credibility: {
              score: opponentCred!.score,
              band: opponentCred!.band,
              provisional: opponentCred!.provisional,
            },
          }
        : null,
    };
  }

  /** Detalle completo de un reto para sus participantes o Juez. */
  async getDetail(challengeId: string, viewerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        creator: true,
        opponent: true,
        judge: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!challenge) throw new NotFoundException('El reto no existe.');

    const isCreator = challenge.creatorId === viewerId;
    const isOpponent = challenge.opponentId === viewerId;
    const isJudge = challenge.judgeId === viewerId;
    if (!isCreator && !isOpponent && !isJudge) {
      throw new ForbiddenException('Solo quienes participan en el reto pueden ver su detalle.');
    }

    const role = isCreator ? 'CREATOR' : isOpponent ? 'OPPONENT' : 'JUDGE';
    const myVote = isCreator ? challenge.creatorVote : isOpponent ? challenge.opponentVote : null;
    const theirs = isCreator ? challenge.opponentVote : isOpponent ? challenge.creatorVote : null;
    const bothVoted = challenge.creatorVote !== null && challenge.opponentVote !== null;
    const oneVote = Number(challenge.creatorVote !== null) + Number(challenge.opponentVote !== null) === 1;

    const creatorCred = buildView(challenge.creator);
    const opponentCred = challenge.opponent ? buildView(challenge.opponent) : null;
    const view = this.toView(challenge);

    return {
      ...view,
      role,
      pot: challenge.mode === 'COINS' ? challenge.stakeAmount * 2 : null,
      createdAt: challenge.createdAt,
      closedAt: challenge.closedAt,
      winnerId: challenge.winnerId,
      creator: {
        id: challenge.creator.id,
        username: challenge.creator.username,
        displayName: challenge.creator.displayName,
        credibility: {
          score: creatorCred.score,
          band: creatorCred.band,
          provisional: creatorCred.provisional,
        },
      },
      opponent: challenge.opponent
        ? {
            id: challenge.opponent.id,
            username: challenge.opponent.username,
            displayName: challenge.opponent.displayName,
            credibility: {
              score: opponentCred!.score,
              band: opponentCred!.band,
              provisional: opponentCred!.provisional,
            },
          }
        : null,
      myVote,
      rivalHasVoted: theirs !== null,
      rivalVote: bothVoted || role === 'JUDGE' || challenge.status === 'CLOSED' ? theirs : null,
      creatorVote: bothVoted || role === 'JUDGE' || challenge.status === 'CLOSED' ? challenge.creatorVote : null,
      opponentVote: bothVoted || role === 'JUDGE' || challenge.status === 'CLOSED' ? challenge.opponentVote : null,
      silenceDeadline:
        challenge.status === 'RESULT' && oneVote && challenge.firstDeclaredAt
          ? new Date(challenge.firstDeclaredAt.getTime() + SILENCE_WINDOW_MS)
          : null,
      judge: {
        proposed: challenge.judgeId !== null,
        assigned: challenge.judgeAssignedAt !== null,
        proposedById: challenge.judgeProposedById,
        judgeUser: challenge.judge
          ? {
              id: challenge.judge.id,
              username: challenge.judge.username,
              displayName: challenge.judge.displayName,
            }
          : null,
        verdictDeadline: challenge.judgeAssignedAt
          ? new Date(challenge.judgeAssignedAt.getTime() + JUDGE_WINDOW_MS)
          : null,
      },
      cashPaymentStatus: challenge.cashPaymentStatus,
      events: challenge.events.map((ev) => ({
        id: ev.id,
        eventType: ev.eventType,
        actorId: ev.actorId,
        payload: ev.payload,
        createdAt: ev.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------------- crear

  async create(creatorId: string, input: CreateChallengeInput, now: Date = new Date()): Promise<ChallengeView> {
    const title = this.resolveTitle(input);
    const mode: ChallengeMode = input.mode ?? 'COINS';
    if (mode !== 'COINS' && mode !== 'CASH') {
      throw new BadRequestException('El modo debe ser Monedas o Plata.');
    }
    const stake = input.stakeAmount;
    if (!Number.isInteger(stake) || stake <= 0) {
      throw new BadRequestException('La apuesta debe ser un número entero positivo.');
    }
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw new BadRequestException('La fecha de vencimiento debe ser futura.');
    }

    let opponentId: string | null = null;
    if (input.opponentId) {
      if (input.opponentId === creatorId) {
        throw new BadRequestException('No podés desafiarte a vos mismo.');
      }
      const friends = await this.friends.listFriends(creatorId);
      if (!friends.some((f) => f.id === input.opponentId)) {
        throw new ForbiddenException('Solo podés desafiar a tus amigos o compartir un link.');
      }
      opponentId = input.opponentId;
    }

    const challenge = await this.createWithUniqueCode(async (inviteCode) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.challenge.create({
          data: { inviteCode, title, creatorId, opponentId, mode, stakeAmount: stake, expiresAt },
        });
        await tx.challengeEvent.create({
          data: {
            challengeId: created.id,
            actorId: creatorId,
            eventType: 'CHALLENGE_CREATED',
            payload: { mode, stakeAmount: stake, opponentId, expiresAt: expiresAt.toISOString() },
          },
        });
        return created;
      }),
    );
    // Reloj de vencimiento: si nadie declara para esa fecha, el reto se cancela.
    await runClock(this.clocks, this.logger, (clocks) => clocks.scheduleExpire(challenge.id, expiresAt));
    return this.toView(challenge);
  }

  // -------------------------------------------------------------- aceptar

  /**
   * El rival acepta: PENDIENTE -> ACTIVO. Todo ocurre en una sola transacción con el reto
   * bloqueado: cambio de estado, rival asignado, reserva de monedas (modo Monedas) y bitácora.
   * Si algo falla (por ejemplo saldo insuficiente) no queda nada a medias.
   */
  async accept(challengeId: string, accepterId: string, now: Date = new Date()) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw new NotFoundException('El reto no existe.');

      if (challenge.status !== 'PENDING') {
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: 'El reto ya no está pendiente.',
          status: challenge.status,
        });
      }
      if (challenge.expiresAt <= now) {
        throw new ConflictException({ code: 'EXPIRED', message: 'El reto venció.' });
      }
      if (accepterId === challenge.creatorId) {
        throw new ForbiddenException('No podés aceptar tu propio reto.');
      }
      if (challenge.opponentId && challenge.opponentId !== accepterId) {
        throw new ForbiddenException('Este reto es para otro jugador.');
      }

      if (challenge.mode === 'COINS') {
        // Lanza InsufficientFundsException (y revierte todo) si alguno no alcanza.
        await this.wallet.reservePot(
          challenge.id,
          [challenge.creatorId, accepterId],
          challenge.stakeAmount,
          tx,
        );
      }

      const updated = await tx.challenge.update({
        where: { id: challenge.id },
        data: { status: 'ACTIVE', opponentId: accepterId },
      });
      await tx.challengeEvent.create({
        data: { challengeId: challenge.id, actorId: accepterId, eventType: 'CHALLENGE_ACCEPTED' },
      });
      if (challenge.mode === 'COINS') {
        await tx.challengeEvent.create({
          data: {
            challengeId: challenge.id,
            actorId: accepterId,
            eventType: 'COINS_RESERVED',
            payload: { perPlayer: challenge.stakeAmount, pot: challenge.stakeAmount * 2 },
          },
        });
      }
      return updated;
    });

    // Efectos secundarios fuera de la transacción: no deben deshacer una aceptación válida.
    try {
      await this.friends.onChallengeAccepted(result.creatorId, accepterId);
    } catch (err) {
      this.logger.error(`No se pudo registrar la amistad/premio del reto ${challengeId}`, err as Error);
    }
    return this.toView(result);
  }

  // ------------------------------------------------ cancelar / rechazar

  /** El creador cancela su reto mientras siga PENDIENTE. No hay monedas reservadas. */
  async cancel(challengeId: string, actorId: string) {
    return this.closePending(challengeId, actorId, 'CREATOR', 'CHALLENGE_CANCELLED');
  }

  /** El rival invitado rechaza el reto mientras siga PENDIENTE. */
  async reject(challengeId: string, actorId: string) {
    return this.closePending(challengeId, actorId, 'OPPONENT', 'CHALLENGE_REJECTED');
  }

  private async closePending(
    challengeId: string,
    actorId: string,
    who: 'CREATOR' | 'OPPONENT',
    eventType: string,
  ) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('El reto no existe.');

    const allowed = who === 'CREATOR' ? challenge.creatorId === actorId : challenge.opponentId === actorId;
    if (!allowed) {
      throw new ForbiddenException(
        who === 'CREATOR'
          ? 'Solo quien creó el reto puede cancelarlo.'
          : 'Solo el jugador desafiado puede rechazar el reto.',
      );
    }

    const closed = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: solo se cancela si sigue PENDIENTE (no pisa una aceptación simultánea).
      const { count } = await tx.challenge.updateMany({
        where: { id: challengeId, status: 'PENDING' },
        data: { status: 'CANCELLED', closedAt: new Date() },
      });
      if (count === 0) {
        const current = await tx.challenge.findUniqueOrThrow({ where: { id: challengeId } });
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: 'El reto ya no está pendiente.',
          status: current.status,
        });
      }
      await tx.challengeEvent.create({ data: { challengeId, actorId, eventType } });
      return { challengeId, status: 'CANCELLED' as const };
    });

    await runClock(this.clocks, this.logger, (clocks) => clocks.cancelAll(challengeId));
    return closed;
  }

  // ---------------------------------------------------------------- helpers

  private resolveTitle(input: CreateChallengeInput): string {
    let title = (input.title ?? '').trim();
    if (!title && input.presetId) {
      const preset = CHALLENGE_PRESETS.find((p) => p.id === input.presetId);
      if (!preset) throw new BadRequestException('La idea rápida elegida no existe.');
      title = preset.text;
    }
    if (title.length < 1 || title.length > TITLE_MAX) {
      throw new BadRequestException(`El reto debe tener entre 1 y ${TITLE_MAX} caracteres.`);
    }
    return title;
  }

  private newInviteCode(): string {
    const bytes = randomBytes(10);
    let out = '';
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return out;
  }

  private async createWithUniqueCode(fn: (code: string) => Promise<Challenge>): Promise<Challenge> {
    for (let i = 0; i < 5; i++) {
      try {
        return await fn(this.newInviteCode());
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err; // solo reintenta si chocó el código
      }
    }
    throw new ConflictException('No se pudo generar un link de invitación único.');
  }

  private toView(c: Challenge): ChallengeView {
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    const shareUrl = `${base}/r/${c.inviteCode}`;
    const stakeLine =
      c.mode === 'COINS'
        ? `🪙 *Pozo en juego:* ${c.stakeAmount * 2} monedas (${c.stakeAmount} c/u)`
        : `💵 *Apuesta entre amigos:* $${c.stakeAmount} c/u`;
    const message = [
      '⚡ *¡Te desafío en I Bet U!*',
      '',
      `🎯 *"${c.title}"*`,
      stakeLine,
      '',
      '👉 *Aceptá el reto acá (recibís +50 monedas gratis):*',
      shareUrl,
    ].join('\n');
    const text = encodeURIComponent(message);
    return {
      id: c.id,
      inviteCode: c.inviteCode,
      title: c.title,
      status: c.status,
      mode: c.mode,
      stakeAmount: c.stakeAmount,
      creatorId: c.creatorId,
      opponentId: c.opponentId,
      expiresAt: c.expiresAt,
      shareUrl,
      whatsappShareUrl: `https://wa.me/?text=${text}`,
    };
  }
}

