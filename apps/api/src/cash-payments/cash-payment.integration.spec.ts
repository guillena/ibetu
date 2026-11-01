import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CASH_PAYMENT_GRACE_MS, CashPaymentService } from './cash-payment.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('CashPaymentService – pago P2P en modo Plata (integración con PostgreSQL)', () => {
  const prisma = new PrismaService();
  const service = new CashPaymentService(prisma);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const CLOSED_AT = new Date('2026-11-01T12:00:00-03:00');
  const afterGrace = new Date(CLOSED_AT.getTime() + CASH_PAYMENT_GRACE_MS);

  async function newUser(extra: Record<string, unknown> = {}) {
    const u = await prisma.user.create({
      data: { displayName: 'P', username: `p_${randomUUID().slice(0, 8)}`, coinsAvailable: 50, ...extra },
    });
    userIds.push(u.id);
    return u;
  }

  /** Reto por Plata cerrado a favor de `winner`, con el acuerdo de pago pendiente. */
  async function closedCashChallenge(overrides: Record<string, unknown> = {}) {
    const winner = await newUser({ paymentAlias: 'ganador.mp' });
    const loser = await newUser();
    const outsider = await newUser();
    const c = await prisma.challenge.create({
      data: {
        inviteCode: randomUUID().slice(0, 10),
        title: 'Partida de FIFA 1v1',
        creatorId: loser.id,
        opponentId: winner.id,
        mode: 'CASH',
        stakeAmount: 5000,
        status: 'CLOSED',
        winnerId: winner.id,
        closedAt: CLOSED_AT,
        cashPaymentStatus: 'PENDING',
        expiresAt: new Date(CLOSED_AT.getTime() + 86_400_000),
        ...overrides,
      },
    });
    challengeIds.push(c.id);
    return { c, winner, loser, outsider };
  }

  const statusOf = async (id: string) =>
    (await prisma.challenge.findUniqueOrThrow({ where: { id } })).cashPaymentStatus;
  const events = (id: string) =>
    prisma.challengeEvent.findMany({
      where: { challengeId: id, eventType: { startsWith: 'CASH_PAYMENT' } },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.challengeEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('alias de cobro', () => {
    it('guarda el alias normalizado y rechaza valores inválidos', async () => {
      const u = await newUser();
      await expect(service.setPaymentAlias(u.id, '  mi.alias.mp  ')).resolves.toEqual({ paymentAlias: 'mi.alias.mp' });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).paymentAlias).toBe('mi.alias.mp');
      await expect(service.setPaymentAlias(u.id, 'ab')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.setPaymentAlias(u.id, 'x'.repeat(61))).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.setPaymentAlias(u.id, '   ')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('datos del acuerdo', () => {
    it('el perdedor ve el alias del ganador y puede marcar "Ya transferí"', async () => {
      const { c, winner, loser } = await closedCashChallenge();
      const info = await service.getPaymentInfo(c.id, loser.id, CLOSED_AT);
      expect(info).toMatchObject({
        status: 'PENDING',
        amount: 5000,
        role: 'LOSER',
        payTo: 'ganador.mp',
        winner: { id: winner.id },
        loser: { id: loser.id },
        allowedActions: ['MARK_PAID'],
      });
    });

    it('el ganador puede confirmar, pero recién puede reclamar incumplimiento tras el plazo', async () => {
      const { c, winner } = await closedCashChallenge();
      const early = await service.getPaymentInfo(c.id, winner.id, new Date(afterGrace.getTime() - 1000));
      expect(early.role).toBe('WINNER');
      expect(early.allowedActions).toEqual(['CONFIRM_RECEIVED']);
      const late = await service.getPaymentInfo(c.id, winner.id, afterGrace);
      expect(late.allowedActions).toEqual(['CONFIRM_RECEIVED', 'CLAIM_DEFAULT']);
      expect(late.defaultClaimableAt?.getTime()).toBe(afterGrace.getTime());
    });

    it('si el ganador no cargó alias, payTo es null', async () => {
      const { c, loser, winner } = await closedCashChallenge();
      await prisma.user.update({ where: { id: winner.id }, data: { paymentAlias: null } });
      expect((await service.getPaymentInfo(c.id, loser.id)).payTo).toBeNull();
    });

    it('un tercero no puede ver ni operar el acuerdo', async () => {
      const { c, outsider } = await closedCashChallenge();
      await expect(service.getPaymentInfo(c.id, outsider.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.markPaid(c.id, outsider.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.confirmReceived(c.id, outsider.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.claimDefault(c.id, outsider.id, afterGrace)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await statusOf(c.id)).toBe('PENDING');
    });
  });

  describe('cambios de estado', () => {
    it('camino feliz: PENDING -> PAID_CLAIMED -> CONFIRMED con bitácora', async () => {
      const { c, winner, loser } = await closedCashChallenge();

      expect(await service.markPaid(c.id, loser.id)).toEqual({ challengeId: c.id, status: 'PAID_CLAIMED' });
      expect(await statusOf(c.id)).toBe('PAID_CLAIMED');

      expect(await service.confirmReceived(c.id, winner.id)).toEqual({ challengeId: c.id, status: 'CONFIRMED' });
      expect(await statusOf(c.id)).toBe('CONFIRMED');

      const log = await events(c.id);
      expect(log.map((e) => [e.eventType, e.actorId])).toEqual([
        ['CASH_PAYMENT_PAID_CLAIMED', loser.id],
        ['CASH_PAYMENT_CONFIRMED', winner.id],
      ]);
    });

    it('el ganador puede confirmar el pago aunque el perdedor no lo haya marcado', async () => {
      const { c, winner } = await closedCashChallenge();
      await service.confirmReceived(c.id, winner.id);
      expect(await statusOf(c.id)).toBe('CONFIRMED');
    });

    it('solo el perdedor marca el pago y solo el ganador lo confirma', async () => {
      const { c, winner, loser } = await closedCashChallenge();
      await expect(service.markPaid(c.id, winner.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.confirmReceived(c.id, loser.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.claimDefault(c.id, loser.id, afterGrace)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await statusOf(c.id)).toBe('PENDING');
    });

    it('reclamo de incumplimiento: rechazado dentro del plazo, aceptado al vencer', async () => {
      const { c, winner } = await closedCashChallenge();
      const err: any = await service
        .claimDefault(c.id, winner.id, new Date(afterGrace.getTime() - 1000))
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'GRACE_PERIOD_ACTIVE' });
      expect(await statusOf(c.id)).toBe('PENDING');

      expect(await service.claimDefault(c.id, winner.id, afterGrace)).toEqual({
        challengeId: c.id,
        status: 'DEFAULTED',
      });
      expect(await statusOf(c.id)).toBe('DEFAULTED');
      expect((await events(c.id)).map((e) => e.eventType)).toEqual(['CASH_PAYMENT_DEFAULTED']);
    });

    it('si el perdedor dice que pagó y el ganador no lo recibió, puede reclamar tras el plazo', async () => {
      const { c, winner, loser } = await closedCashChallenge();
      await service.markPaid(c.id, loser.id);
      await service.claimDefault(c.id, winner.id, afterGrace);
      expect(await statusOf(c.id)).toBe('DEFAULTED');
    });

    it('los estados finales no admiten más acciones', async () => {
      const confirmed = await closedCashChallenge();
      await service.confirmReceived(confirmed.c.id, confirmed.winner.id);
      await expect(service.markPaid(confirmed.c.id, confirmed.loser.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.claimDefault(confirmed.c.id, confirmed.winner.id, afterGrace)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.confirmReceived(confirmed.c.id, confirmed.winner.id)).rejects.toBeInstanceOf(ConflictException);

      const defaulted = await closedCashChallenge();
      await service.claimDefault(defaulted.c.id, defaulted.winner.id, afterGrace);
      await expect(service.confirmReceived(defaulted.c.id, defaulted.winner.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.markPaid(defaulted.c.id, defaulted.loser.id)).rejects.toBeInstanceOf(ConflictException);
      expect(await statusOf(defaulted.c.id)).toBe('DEFAULTED');
      // Ninguna acción rechazada dejó rastros en la bitácora.
      expect(await events(confirmed.c.id)).toHaveLength(1);
      expect(await events(defaulted.c.id)).toHaveLength(1);
    });

    it('no se puede marcar el pago dos veces', async () => {
      const { c, loser } = await closedCashChallenge();
      await service.markPaid(c.id, loser.id);
      await expect(service.markPaid(c.id, loser.id)).rejects.toBeInstanceOf(ConflictException);
      expect(await events(c.id)).toHaveLength(1);
    });

    it('acciones simultáneas: confirmar y reclamar incumplimiento no pueden ganar los dos', async () => {
      const { c, winner } = await closedCashChallenge();
      const results = await Promise.allSettled([
        service.confirmReceived(c.id, winner.id),
        service.claimDefault(c.id, winner.id, afterGrace),
        service.confirmReceived(c.id, winner.id),
        service.claimDefault(c.id, winner.id, afterGrace),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(['CONFIRMED', 'DEFAULTED']).toContain(await statusOf(c.id));
      expect(await events(c.id)).toHaveLength(1);
    });
  });

  describe('retos que no admiten pago', () => {
    it('un reto por Monedas no tiene acuerdo de pago', async () => {
      const { c, winner } = await closedCashChallenge({ mode: 'COINS', cashPaymentStatus: 'NOT_APPLICABLE' });
      await expect(service.getPaymentInfo(c.id, winner.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.confirmReceived(c.id, winner.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un reto sin cerrar o sin ganador tampoco', async () => {
      const open = await closedCashChallenge({ status: 'ACTIVE', winnerId: null, cashPaymentStatus: 'NOT_APPLICABLE' });
      await expect(service.getPaymentInfo(open.c.id, open.winner.id)).rejects.toBeInstanceOf(BadRequestException);
      const noWinner = await closedCashChallenge({ winnerId: null });
      await expect(service.markPaid(noWinner.c.id, noWinner.loser.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un reto inexistente responde 404', async () => {
      const u = await newUser();
      await expect(service.getPaymentInfo(randomUUID(), u.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

