import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { ChallengesService } from './challenges.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from './results.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('ChallengeResultsService – declarar, cambiar voto, cerrar y disputar (integración)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const challenges = new ChallengesService(prisma, wallet, friends);
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma));
  const userIds: string[] = [];
  const DAY = 86_400_000;
  const T0 = new Date();
  const farFuture = () => new Date(Date.now() + 30 * DAY);

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'R', username: `r_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    // Asiento inicial: el saldo debe coincidir siempre con el historial.
    await prisma.walletTransaction.create({
      data: { userId: u.id, currency: 'COINS', type: 'BONUS_INIT', amount: coins, idempotencyKey: `bonus_init:${u.id}` },
    });
    userIds.push(u.id);
    return u;
  }

  /** Reto ACTIVO creado y aceptado por el flujo real (reserva incluida). */
  async function activeChallenge(mode: 'COINS' | 'CASH' = 'COINS', stake = 10) {
    const a = await newUser();
    const b = await newUser();
    const created = await challenges.create(a.id, {
      title: 'Emboque de papel',
      stakeAmount: mode === 'CASH' ? 5000 : stake,
      mode,
      expiresAt: farFuture(),
    });
    await challenges.accept(created.id, b.id);
    return { id: created.id, a, b };
  }

  const bal = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { available: u.coinsAvailable, reserved: u.coinsReserved };
  };
  const row = (id: string) => prisma.challenge.findUniqueOrThrow({ where: { id } });
  const user = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
  const events = async (id: string) =>
    (await prisma.challengeEvent.findMany({ where: { challengeId: id }, orderBy: { createdAt: 'asc' } })).map(
      (e) => e.eventType,
    );
  async function expectLedger(...ids: string[]) {
    for (const id of ids) expect(await wallet.ledgerBalance(id)).toBe((await bal(id)).available);
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    const ids = (
      await prisma.challenge.findMany({
        where: { OR: [{ creatorId: { in: userIds } }, { opponentId: { in: userIds } }] },
        select: { id: true },
      })
    ).map((c) => c.id);
    await prisma.challengeEvent.deleteMany({ where: { challengeId: { in: ids } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: ids } } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { invitedById: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // ============================================ primera declaración
  describe('primera declaración', () => {
    it('pasa a RESULTADO, oculta el voto del rival y arranca el reloj de 24 h', async () => {
      const { id, a, b } = await activeChallenge();
      const res = await results.declare(id, a.id, 'WIN', T0);

      expect(res).toMatchObject({
        status: 'RESULT', yourVote: 'WIN', rivalHasVoted: false, rivalVote: null,
        outcome: 'WAITING', winnerId: null, changed: true,
      });
      expect(res.silenceDeadline?.getTime()).toBe(T0.getTime() + SILENCE_WINDOW_MS);
      expect((await row(id)).firstDeclaredAt?.getTime()).toBe(T0.getTime());

      // El rival ve que ya hay una declaración, pero no cuál.
      const rival = await results.declare(id, b.id, 'LOSS', T0).catch((e) => e);
      expect(rival.rivalHasVoted).toBe(true);
      // Las monedas siguen reservadas hasta el cierre.
      expect(await events(id)).toContain('RESULT_DECLARED');
    });

    it('mientras solo vota uno, las monedas siguen reservadas', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 10 });
    });
  });

  // ================================================== coincidencias
  describe('cierre por coincidencia', () => {
    it('A "gané" + B "ganó mi rival": cierra, A cobra el pozo de 20 (+10 netos)', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const res = await results.declare(id, b.id, 'LOSS', T0);

      expect(res).toMatchObject({ status: 'CLOSED', outcome: 'WIN', winnerId: a.id, rivalVote: 'WIN' });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id);

      const c = await row(id);
      expect(c).toMatchObject({ status: 'CLOSED', winnerId: a.id, creatorVote: 'WIN', opponentVote: 'LOSS' });
      expect(c.closedAt?.getTime()).toBe(T0.getTime());
      // Los eventos de una misma transacción pueden compartir milisegundo: no se asume su orden.
      expect([...(await events(id))].sort()).toEqual(
        [
          'CHALLENGE_CREATED', 'CHALLENGE_ACCEPTED', 'COINS_RESERVED',
          'RESULT_DECLARED', 'RESULT_DECLARED', 'COINS_SETTLED', 'CHALLENGE_CLOSED',
        ].sort(),
      );
    });

    it('gana el rival cuando es el invitado quien dice "gané" (A "ganó mi rival" + B "gané")', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'LOSS', T0);
      const res = await results.declare(id, b.id, 'WIN', T0);
      expect(res).toMatchObject({ status: 'CLOSED', winnerId: b.id });
      expect(await bal(b.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id);
    });

    it('actualiza victorias y partidos jugados', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      expect(await user(a.id)).toMatchObject({ totalPlayed: 1, totalWins: 1 });
      expect(await user(b.id)).toMatchObject({ totalPlayed: 1, totalWins: 0 });
    });

    it('ambos "empate": cierra sin ganador y devuelve 10 a cada uno', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'DRAW', T0);
      const res = await results.declare(id, b.id, 'DRAW', T0);

      expect(res).toMatchObject({ status: 'CLOSED', outcome: 'DRAW', winnerId: null });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectLedger(a.id, b.id);
      expect(await events(id)).toContain('COINS_REFUNDED');
      expect((await row(id)).winnerId).toBeNull();
      expect(await user(a.id)).toMatchObject({ totalPlayed: 1, totalWins: 0 });
    });

    it('ambos dicen "ganó mi rival": nadie reclama el premio, se devuelve el pozo', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'LOSS', T0);
      const res = await results.declare(id, b.id, 'LOSS', T0);
      expect(res).toMatchObject({ status: 'CLOSED', outcome: 'DRAW', winnerId: null });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
    });

    it('en modo Plata: cierra, deja el pago PENDIENTE y no mueve monedas', async () => {
      const { id, a, b } = await activeChallenge('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      const c = await row(id);
      expect(c).toMatchObject({ status: 'CLOSED', winnerId: a.id, cashPaymentStatus: 'PENDING' });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      const evs = await events(id);
      expect(evs).not.toContain('COINS_SETTLED');
      expect(evs).toContain('CHALLENGE_CLOSED');
    });

    it('en modo Plata un empate no genera acuerdo de pago', async () => {
      const { id, a, b } = await activeChallenge('CASH');
      await results.declare(id, a.id, 'DRAW', T0);
      await results.declare(id, b.id, 'DRAW', T0);
      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: null, cashPaymentStatus: 'NOT_APPLICABLE' });
    });
  });

  // ======================================================== disputa
  describe('disputa', () => {
    it('ambos "gané yo": DISPUTA, el pozo queda bloqueado y se ven los dos votos', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const res = await results.declare(id, b.id, 'WIN', T0);

      expect(res).toMatchObject({ status: 'DISPUTE', outcome: 'DISPUTE', rivalVote: 'WIN', winnerId: null });
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 10 });
      expect(await events(id)).toContain('DISPUTE_OPENED');
      expect((await row(id)).winnerId).toBeNull();
    });

    it('"gané" contra "empate" también es contradicción', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const res = await results.declare(id, b.id, 'DRAW', T0);
      expect(res.status).toBe('DISPUTE');
    });

    it('un jugador rectifica en disputa ("ganó mi rival"): se resuelve y se paga', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'WIN', T0);
      const res = await results.declare(id, b.id, 'LOSS', T0);

      expect(res).toMatchObject({ status: 'CLOSED', winnerId: a.id });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id);
      const evs = await events(id);
      expect(evs.filter((e) => e === 'DISPUTE_OPENED')).toHaveLength(1);
      expect(evs.at(-1)).toBe('CHALLENGE_CLOSED');
    });

    it('cambiar el voto en disputa sin resolverla la mantiene abierta, sin repetir el asiento', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'WIN', T0);
      const res = await results.declare(id, a.id, 'DRAW', T0); // empate vs "gané": sigue en conflicto
      expect(res.status).toBe('DISPUTE');
      expect((await events(id)).filter((e) => e === 'DISPUTE_OPENED')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
    });

    it('una disputa resuelta por rectificación no cuenta para la constancia', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      for (const u of [a, b]) {
        expect(await user(u.id)).toMatchObject({ streakDaysCount: 0, lastCleanChallengeAt: null });
      }
    });
  });

  // ================================================ cambio de voto
  describe('cambio de voto', () => {
    it('el único votante puede cambiar su voto y el reloj de 24 h se reinicia', async () => {
      const { id, a } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const later = new Date(T0.getTime() + 10 * 3_600_000);
      const res = await results.declare(id, a.id, 'DRAW', later);

      expect(res).toMatchObject({ status: 'RESULT', yourVote: 'DRAW', changed: true });
      expect(res.silenceDeadline?.getTime()).toBe(later.getTime() + SILENCE_WINDOW_MS);
      expect((await events(id)).filter((e) => e === 'RESULT_DECLARED')).toHaveLength(2);
    });

    it('repetir el mismo voto no cambia nada ni deja asientos', async () => {
      const { id, a } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const before = await events(id);
      const again = await results.declare(id, a.id, 'WIN', new Date(T0.getTime() + 5 * 3_600_000));
      expect(again.changed).toBe(false);
      expect(await events(id)).toEqual(before);
      expect((await row(id)).firstDeclaredAt?.getTime()).toBe(T0.getTime()); // reloj intacto
    });

    it('si el primer votante se corrige hacia la coincidencia del rival, cierra', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'DRAW', T0); // disputa
      const res = await results.declare(id, a.id, 'DRAW', T0);
      expect(res).toMatchObject({ status: 'CLOSED', outcome: 'DRAW' });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
    });
  });

  // ============================================== validaciones
  describe('validaciones y permisos', () => {
    it('rechaza votos inválidos', async () => {
      const { id, a } = await activeChallenge();
      for (const bad of ['TIE', '', undefined, null, 'win']) {
        await expect(results.declare(id, a.id, bad as any, T0)).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('solo los jugadores del reto pueden declarar', async () => {
      const { id } = await activeChallenge();
      const stranger = await newUser();
      await expect(results.declare(id, stranger.id, 'WIN', T0)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(id)).status).toBe('ACTIVE');
    });

    it('un reto inexistente responde 404', async () => {
      const u = await newUser();
      await expect(results.declare(randomUUID(), u.id, 'WIN', T0)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no se declara en un reto pendiente, cancelado o ya cerrado', async () => {
      const a = await newUser();
      const stranger = await newUser();
      const pending = await challenges.create(a.id, { title: 'x', stakeAmount: 10, expiresAt: farFuture() });

      // El creador es jugador del reto, pero todavía está pendiente (sin rival): no admite votos.
      const p: any = await results.declare(pending.id, a.id, 'WIN', T0).catch((e) => e);
      expect(p).toBeInstanceOf(ConflictException);
      expect(p.getResponse()).toMatchObject({ code: 'VOTING_CLOSED', status: 'PENDING' });
      // Un tercero sigue sin poder tocarlo.
      await expect(results.declare(pending.id, stranger.id, 'WIN', T0)).rejects.toBeInstanceOf(ForbiddenException);

      await challenges.cancel(pending.id, a.id);
      const cancelled: any = await results.declare(pending.id, a.id, 'WIN', T0).catch((e) => e);
      expect(cancelled).toBeInstanceOf(ConflictException);
      expect(cancelled.getResponse()).toMatchObject({ code: 'VOTING_CLOSED', status: 'CANCELLED' });
      expect(await row(pending.id)).toMatchObject({ creatorVote: null, status: 'CANCELLED' });

      const { id, a: p1, b: p2 } = await activeChallenge();
      await results.declare(id, p1.id, 'WIN', T0);
      await results.declare(id, p2.id, 'LOSS', T0);
      const closed: any = await results.declare(id, p1.id, 'DRAW', T0).catch((e) => e);
      expect(closed).toBeInstanceOf(ConflictException);
      expect(closed.getResponse()).toMatchObject({ code: 'VOTING_CLOSED', status: 'CLOSED' });
      // Nada se movió después del cierre.
      expect(await bal(p1.id)).toEqual({ available: 110, reserved: 0 });
    });

    it('pasada la fecha límite sin declaraciones, ya no se puede declarar', async () => {
      const { id, a } = await activeChallenge();
      const err: any = await results.declare(id, a.id, 'WIN', new Date(Date.now() + 31 * DAY)).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'EXPIRED' });
      expect((await row(id)).status).toBe('ACTIVE');
    });

    it('si ya hay una declaración, se puede seguir votando pasada la fecha límite', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      const late = new Date(Date.now() + 31 * DAY);
      await expect(results.declare(id, b.id, 'LOSS', late)).resolves.toMatchObject({ status: 'CLOSED' });
    });
  });

  // ============================================== constancia
  describe('Premio de Constancia al cerrar', () => {
    it('cerrar un reto limpio suma un día para ambos jugadores', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      expect(await user(a.id)).toMatchObject({ streakDaysCount: 1 });
      expect(await user(b.id)).toMatchObject({ streakDaysCount: 1 });
    });

    it('un empate no suma el día', async () => {
      const { id, a, b } = await activeChallenge();
      await results.declare(id, a.id, 'DRAW', T0);
      await results.declare(id, b.id, 'DRAW', T0);
      expect(await user(a.id)).toMatchObject({ streakDaysCount: 0, lastCleanChallengeAt: null });
    });

    it('3 días seguidos con un reto limpio por día acreditan +30 a ambos, ganen o pierdan', async () => {
      const a = await newUser();
      const b = await newUser();
      for (let day = 0; day < 3; day++) {
        const when = new Date(T0.getTime() + day * DAY);
        const c = await challenges.create(a.id, { title: `día ${day}`, stakeAmount: 10, expiresAt: farFuture() });
        await challenges.accept(c.id, b.id);
        await results.declare(c.id, a.id, 'WIN', when);
        await results.declare(c.id, b.id, 'LOSS', when);
      }
      for (const u of [a, b]) {
        const tx = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'STREAK3' } });
        expect(tx).toHaveLength(1);
        expect(await user(u.id)).toMatchObject({ streakDaysCount: 0 });
      }
      // a: 100 -10*3 reservas +20*3 pagos +30 premio = 160. b: 100 -30 +30 premio = 100.
      expect(await bal(a.id)).toEqual({ available: 160, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectLedger(a.id, b.id);
    });
  });

  // ================================================ atomicidad
  describe('atomicidad del cierre', () => {
    it('si la liquidación falla, el voto y el estado se revierten por completo', async () => {
      // Reto ACTIVO creado a mano SIN monedas reservadas: liquidar debe fallar.
      const a = await newUser();
      const b = await newUser();
      const c = await prisma.challenge.create({
        data: {
          inviteCode: randomUUID().slice(0, 10), title: 'sin reserva', creatorId: a.id, opponentId: b.id,
          stakeAmount: 10, status: 'ACTIVE', expiresAt: farFuture(),
        },
      });
      await results.declare(c.id, a.id, 'WIN', T0);
      await expect(results.declare(c.id, b.id, 'LOSS', T0)).rejects.toBeInstanceOf(BadRequestException);

      const after = await row(c.id);
      expect(after).toMatchObject({ status: 'RESULT', opponentVote: null, winnerId: null, closedAt: null });
      expect(await events(c.id)).toEqual(['RESULT_DECLARED']); // sin cierre ni liquidación a medias
      expect(await user(a.id)).toMatchObject({ totalPlayed: 0, totalWins: 0, streakDaysCount: 0 });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
    });
  });

  // ============================================== concurrencia
  describe('concurrencia', () => {
    it('ambos votan al mismo tiempo (coincidencia): se cierra y se paga una sola vez', async () => {
      const { id, a, b } = await activeChallenge();
      await Promise.all([results.declare(id, a.id, 'WIN', T0), results.declare(id, b.id, 'LOSS', T0)]);

      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: a.id });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      expect(await prisma.walletTransaction.count({ where: { challengeId: id, type: 'PAYOUT' } })).toBe(2);
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      await expectLedger(a.id, b.id);
    });

    it('votos duplicados y simultáneos de ambos lados: un solo cierre y un solo pago', async () => {
      const { id, a, b } = await activeChallenge();
      const calls = [
        ...Array.from({ length: 6 }, () => results.declare(id, a.id, 'WIN', T0)),
        ...Array.from({ length: 6 }, () => results.declare(id, b.id, 'LOSS', T0)),
      ];
      const settled = await Promise.allSettled(calls);
      expect(settled.some((r) => r.status === 'fulfilled')).toBe(true);

      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: a.id });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      await expectLedger(a.id, b.id);
    });

    it('ambos dicen "gané" a la vez: queda una sola disputa', async () => {
      const { id, a, b } = await activeChallenge();
      await Promise.all([results.declare(id, a.id, 'WIN', T0), results.declare(id, b.id, 'WIN', T0)]);
      expect((await row(id)).status).toBe('DISPUTE');
      expect((await events(id)).filter((e) => e === 'DISPUTE_OPENED')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
    });

    it('8 retos distintos cerrándose en paralelo mantienen todos los saldos consistentes', async () => {
      const games = await Promise.all(Array.from({ length: 8 }, () => activeChallenge()));
      await Promise.all(
        games.flatMap((g) => [results.declare(g.id, g.a.id, 'WIN', T0), results.declare(g.id, g.b.id, 'LOSS', T0)]),
      );
      for (const g of games) {
        expect(await row(g.id)).toMatchObject({ status: 'CLOSED', winnerId: g.a.id });
        expect(await bal(g.a.id)).toEqual({ available: 110, reserved: 0 });
        expect(await bal(g.b.id)).toEqual({ available: 90, reserved: 0 });
        await expectLedger(g.a.id, g.b.id);
      }
    });
  });
});
