import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { InsufficientFundsException, WalletService } from './wallet.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('WalletService (integración y concurrencia con PostgreSQL)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const PARALLEL = 10;

  async function newUser(coins = 100) {
    const user = await prisma.user.create({
      data: { displayName: 'W', username: `w_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    userIds.push(user.id);
    // Asiento inicial para que el historial refleje el saldo de partida.
    await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        currency: 'COINS',
        type: 'BONUS_INIT',
        amount: coins,
        idempotencyKey: `bonus_init:${user.id}`,
      },
    });
    return user;
  }

  async function newChallenge(creatorId: string, opponentId: string, stake = 10) {
    const c = await prisma.challenge.create({
      data: {
        inviteCode: randomUUID().slice(0, 10),
        title: 'reto',
        creatorId,
        opponentId,
        stakeAmount: stake,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    challengeIds.push(c.id);
    return c;
  }

  const balance = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { available: u.coinsAvailable, reserved: u.coinsReserved };
  };

  /** El saldo disponible siempre debe coincidir con la suma del historial. */
  async function expectConsistent(...ids: string[]) {
    for (const id of ids) {
      const { available } = await balance(id);
      expect(await wallet.ledgerBalance(id)).toBe(available);
    }
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('reserva', () => {
    it('reserva 10 de cada jugador y arma un pozo de 20', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newChallenge(a.id, b.id);

      expect(await wallet.reservePot(c.id, [a.id, b.id], 10)).toBe(true);
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await balance(b.id)).toEqual({ available: 90, reserved: 10 });
      await expectConsistent(a.id, b.id);
    });

    it('10 reservas paralelas del mismo reto: se reserva una sola vez', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newChallenge(a.id, b.id);

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => wallet.reservePot(c.id, [a.id, b.id], 10)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await balance(b.id)).toEqual({ available: 90, reserved: 10 });
      await expectConsistent(a.id, b.id);
    });

    it('si un jugador no tiene saldo, no se reserva nada de ninguno (atómico)', async () => {
      const a = await newUser(100);
      const poor = await newUser(5);
      const c = await newChallenge(a.id, poor.id);

      await expect(wallet.reservePot(c.id, [a.id, poor.id], 10)).rejects.toBeInstanceOf(
        InsufficientFundsException,
      );
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(poor.id)).toEqual({ available: 5, reserved: 0 });
      await expectConsistent(a.id, poor.id);
    });

    it('nunca deja el saldo negativo si varias reservas compiten por las mismas monedas', async () => {
      const a = await newUser(10); // alcanza para un solo reto de 10
      const rivals = await Promise.all(Array.from({ length: 5 }, () => newUser(100)));
      const challenges = await Promise.all(rivals.map((r) => newChallenge(a.id, r.id)));

      const results = await Promise.allSettled(
        challenges.map((c, i) => wallet.reservePot(c.id, [a.id, rivals[i].id], 10)),
      );
      expect(results.filter((r) => r.status === 'fulfilled' && r.value === true)).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
      expect(await balance(a.id)).toEqual({ available: 0, reserved: 10 });
      await expectConsistent(a.id);
    });

    it('rechaza montos inválidos', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newChallenge(a.id, b.id);
      await expect(wallet.reservePot(c.id, [a.id, b.id], 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(wallet.reservePot(c.id, [a.id, b.id], -5)).rejects.toBeInstanceOf(BadRequestException);
      await expect(wallet.reservePot(c.id, [a.id, b.id], 2.5)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('liquidación del premio', () => {
    it('el ganador recibe el pozo de 20 (+10 netos) y el perdedor pierde su aporte', async () => {
      const w = await newUser();
      const l = await newUser();
      const c = await newChallenge(w.id, l.id);
      await wallet.reservePot(c.id, [w.id, l.id], 10);

      expect(await wallet.settleWinner(c.id, w.id, l.id, 10)).toBe(true);
      expect(await balance(w.id)).toEqual({ available: 110, reserved: 0 });
      expect(await balance(l.id)).toEqual({ available: 90, reserved: 0 });
      await expectConsistent(w.id, l.id);
    });

    it('10 liquidaciones paralelas: el premio se acredita exactamente una vez', async () => {
      const w = await newUser();
      const l = await newUser();
      const c = await newChallenge(w.id, l.id);
      await wallet.reservePot(c.id, [w.id, l.id], 10);

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => wallet.settleWinner(c.id, w.id, l.id, 10)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await balance(w.id)).toEqual({ available: 110, reserved: 0 });
      expect(await balance(l.id)).toEqual({ available: 90, reserved: 0 });

      const payouts = await prisma.walletTransaction.findMany({
        where: { challengeId: c.id, userId: w.id, type: 'PAYOUT' },
      });
      expect(payouts).toHaveLength(1);
      expect(payouts[0]).toMatchObject({ amount: 20, idempotencyKey: `settle:${c.id}:${w.id}` });
      await expectConsistent(w.id, l.id);
    });

    it('una liquidación repetida en secuencia no vuelve a pagar', async () => {
      const w = await newUser();
      const l = await newUser();
      const c = await newChallenge(w.id, l.id);
      await wallet.reservePot(c.id, [w.id, l.id], 10);
      expect(await wallet.settleWinner(c.id, w.id, l.id, 10)).toBe(true);
      expect(await wallet.settleWinner(c.id, w.id, l.id, 10)).toBe(false);
      expect(await balance(w.id)).toEqual({ available: 110, reserved: 0 });
    });

    it('no liquida un reto sin monedas reservadas', async () => {
      const w = await newUser();
      const l = await newUser();
      const c = await newChallenge(w.id, l.id);
      await expect(wallet.settleWinner(c.id, w.id, l.id, 10)).rejects.toBeInstanceOf(BadRequestException);
      expect(await balance(w.id)).toEqual({ available: 100, reserved: 0 });
    });
  });

  describe('reembolso', () => {
    it('devuelve 10 a cada jugador y libera la reserva', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newChallenge(a.id, b.id);
      await wallet.reservePot(c.id, [a.id, b.id], 10);

      expect(await wallet.refundPot(c.id, [a.id, b.id], 10)).toBe(true);
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectConsistent(a.id, b.id);
    });

    it('10 reembolsos paralelos: se devuelve una sola vez', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newChallenge(a.id, b.id);
      await wallet.reservePot(c.id, [a.id, b.id], 10);

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => wallet.refundPot(c.id, [a.id, b.id], 10)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectConsistent(a.id, b.id);
    });

    it('carrera pago vs. reembolso del mismo reto: gana uno solo, nunca ambos', async () => {
      const w = await newUser();
      const l = await newUser();
      const c = await newChallenge(w.id, l.id);
      await wallet.reservePot(c.id, [w.id, l.id], 10);

      const ops = [
        ...Array.from({ length: 5 }, () => wallet.settleWinner(c.id, w.id, l.id, 10)),
        ...Array.from({ length: 5 }, () => wallet.refundPot(c.id, [w.id, l.id], 10)),
      ];
      const results = await Promise.all(ops);
      expect(results.filter(Boolean)).toHaveLength(1);

      // El dinero total del sistema se conserva: 200 antes y después.
      const wb = await balance(w.id);
      const lb = await balance(l.id);
      expect(wb.available + lb.available).toBe(200);
      expect(wb.reserved + lb.reserved).toBe(0);
      await expectConsistent(w.id, l.id);
    });
  });

  describe('emisión de monedas (credit)', () => {
    it('acredita una sola vez por clave de idempotencia, aun en paralelo', async () => {
      const u = await newUser(0 + 1); // saldo base 1
      const key = `test_bonus:${u.id}`;
      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () => wallet.credit(u.id, 'LIFELINE', 20, key)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await balance(u.id)).toEqual({ available: 21, reserved: 0 });
      await expectConsistent(u.id);
    });
  });
});

