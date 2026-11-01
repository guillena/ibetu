import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import { FriendsService, REFERRAL_COINS } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { InsufficientFundsException, WalletService } from '../wallet/wallet.service.js';
import { WhatsappService } from '../whatsapp/whatsapp.service.js';
import { CHALLENGE_PRESETS, ChallengesService, TITLE_MAX } from './challenges.service.js';

// Requiere `npm run db:up` (PostgreSQL + Redis locales).
describe('ChallengesService – crear, aceptar, cancelar y rechazar (integración)', () => {
  const prisma = new PrismaService();
  const redis = new RedisService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const service = new ChallengesService(prisma, wallet, friends);
  const auth = new AuthService(prisma, new JwtService({ secret: 'test' }), redis);
  const wsp = new WhatsappService(prisma, redis, auth, friends);

  const userIds: string[] = [];
  const phone = () => `54911${Math.floor(10000000 + Math.random() * 89999999)}`;
  const inOneDay = () => new Date(Date.now() + 86_400_000);

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'C', username: `c_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    userIds.push(u.id);
    return u;
  }
  async function newFriends(coinsA = 100, coinsB = 100) {
    const a = await newUser(coinsA);
    const b = await newUser(coinsB);
    await friends.connectFriends(a.id, b.id);
    return { a, b };
  }
  const base = (over: Record<string, unknown> = {}) => ({
    title: '¿A que no embocás el papel en el cesto?',
    stakeAmount: 10,
    expiresAt: inOneDay(),
    ...over,
  });
  const balance = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { available: u.coinsAvailable, reserved: u.coinsReserved };
  };
  const row = (id: string) => prisma.challenge.findUniqueOrThrow({ where: { id } });
  const eventTypes = async (id: string) =>
    (await prisma.challengeEvent.findMany({ where: { challengeId: id }, orderBy: { createdAt: 'asc' } })).map(
      (e) => e.eventType,
    );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    const challengeIds = (
      await prisma.challenge.findMany({
        where: { OR: [{ creatorId: { in: userIds } }, { opponentId: { in: userIds } }] },
        select: { id: true },
      })
    ).map((c) => c.id);
    await prisma.challengeEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] },
    });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { invitedById: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await redis.onModuleDestroy();
  });

  // ================================================================= CREAR
  describe('crear', () => {
    it('crea el reto PENDIENTE con link de invitación y primer evento en la bitácora', async () => {
      const { a, b } = await newFriends();
      const res = await service.create(a.id, base({ opponentId: b.id }));

      expect(res).toMatchObject({
        status: 'PENDING',
        mode: 'COINS',
        stakeAmount: 10,
        creatorId: a.id,
        opponentId: b.id,
      });
      expect(res.inviteCode).toMatch(/^[A-Z2-9]{10}$/);
      expect(res.shareUrl).toContain(`/r/${res.inviteCode}`);
      expect(decodeURIComponent(res.whatsappShareUrl)).toContain(res.shareUrl);
      expect(await eventTypes(res.id)).toEqual(['CHALLENGE_CREATED']);
      // Crear no mueve monedas.
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
    });

    it('sin rival queda abierto para compartir por link', async () => {
      const a = await newUser();
      const res = await service.create(a.id, base());
      expect(res.opponentId).toBeNull();
    });

    it('usa una idea rápida (preset) si no hay texto; el texto propio tiene prioridad', async () => {
      const a = await newUser();
      const fromPreset = await service.create(a.id, base({ title: undefined, presetId: 'ping-pong' }));
      expect(fromPreset.title).toBe(CHALLENGE_PRESETS.find((p) => p.id === 'ping-pong')!.text);

      const own = await service.create(a.id, base({ title: 'Mi reto', presetId: 'ping-pong' }));
      expect(own.title).toBe('Mi reto');
      expect(service.listPresets().length).toBeGreaterThan(0);
    });

    it('soporta el modo Plata con monto en pesos', async () => {
      const a = await newUser();
      const res = await service.create(a.id, base({ mode: 'CASH', stakeAmount: 5000 }));
      expect(res).toMatchObject({ mode: 'CASH', stakeAmount: 5000 });
      expect((await row(res.id)).cashPaymentStatus).toBe('NOT_APPLICABLE');
    });

    it('valida los datos de entrada', async () => {
      const a = await newUser();
      const bad = async (over: Record<string, unknown>) =>
        expect(service.create(a.id, base(over))).rejects.toBeInstanceOf(BadRequestException);

      await bad({ title: '   ' });
      await bad({ title: 'x'.repeat(TITLE_MAX + 1) });
      await bad({ title: undefined, presetId: 'no-existe' });
      await bad({ stakeAmount: 0 });
      await bad({ stakeAmount: -10 });
      await bad({ stakeAmount: 2.5 });
      await bad({ mode: 'BITCOIN' });
      await bad({ expiresAt: new Date(Date.now() - 1000) });
      await bad({ expiresAt: 'no-es-una-fecha' });
      await bad({ opponentId: a.id });
    });

    it('acepta exactamente el largo máximo del texto', async () => {
      const a = await newUser();
      await expect(service.create(a.id, base({ title: 'x'.repeat(TITLE_MAX) }))).resolves.toBeDefined();
    });

    it('solo se puede desafiar a un amigo', async () => {
      const a = await newUser();
      const stranger = await newUser();
      await expect(service.create(a.id, base({ opponentId: stranger.id }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ================================================================ ACEPTAR
  describe('aceptar', () => {
    it('pasa a ACTIVO, reserva 10 de cada jugador (pozo 20) y registra la bitácora', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));

      const res = await service.accept(c.id, b.id);
      expect(res).toMatchObject({ status: 'ACTIVE', opponentId: b.id });
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await balance(b.id)).toEqual({ available: 90, reserved: 10 });
      expect(await eventTypes(c.id)).toEqual(['CHALLENGE_CREATED', 'CHALLENGE_ACCEPTED', 'COINS_RESERVED']);

      const keys = (await prisma.walletTransaction.findMany({ where: { challengeId: c.id } })).map(
        (t) => t.idempotencyKey,
      );
      expect(keys.sort()).toEqual([`reserve:${c.id}:${a.id}`, `reserve:${c.id}:${b.id}`].sort());
    });

    it('un reto abierto por link lo acepta cualquiera y queda como rival', async () => {
      const a = await newUser();
      const guest = await newUser();
      const c = await service.create(a.id, base());
      const res = await service.accept(c.id, guest.id);
      expect(res.opponentId).toBe(guest.id);
      expect(res.status).toBe('ACTIVE');
    });

    it('aceptar crea la amistad bidireccional (modo link)', async () => {
      const a = await newUser();
      const guest = await newUser();
      const c = await service.create(a.id, base());
      await service.accept(c.id, guest.id);
      expect((await friends.listFriends(a.id)).map((f) => f.id)).toContain(guest.id);
      expect((await friends.listFriends(guest.id)).map((f) => f.id)).toContain(a.id);
    });

    it('en modo Plata activa el reto sin mover monedas', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ mode: 'CASH', stakeAmount: 5000, opponentId: b.id }));
      const res = await service.accept(c.id, b.id);
      expect(res.status).toBe('ACTIVE');
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      expect(await eventTypes(c.id)).toEqual(['CHALLENGE_CREATED', 'CHALLENGE_ACCEPTED']);
    });

    it('con saldo insuficiente del rival: no se activa y no queda nada reservado', async () => {
      const { a, b } = await newFriends(100, 5);
      const c = await service.create(a.id, base({ opponentId: b.id }));

      await expect(service.accept(c.id, b.id)).rejects.toBeInstanceOf(InsufficientFundsException);
      expect((await row(c.id)).status).toBe('PENDING');
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 5, reserved: 0 });
      expect(await eventTypes(c.id)).toEqual(['CHALLENGE_CREATED']);
    });

    it('con saldo insuficiente del creador tampoco se activa', async () => {
      const { a, b } = await newFriends(5, 100);
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await expect(service.accept(c.id, b.id)).rejects.toBeInstanceOf(InsufficientFundsException);
      expect((await row(c.id)).status).toBe('PENDING');
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
    });

    it('si el rival recarga, puede aceptar después del rechazo por saldo', async () => {
      const { a, b } = await newFriends(100, 5);
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await expect(service.accept(c.id, b.id)).rejects.toBeInstanceOf(InsufficientFundsException);
      await wallet.credit(b.id, 'LIFELINE', 20, `test_recharge:${b.id}`);
      await expect(service.accept(c.id, b.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('rechaza aceptar el propio reto, un reto ajeno, uno vencido o inexistente', async () => {
      const { a, b } = await newFriends();
      const other = await newUser();
      const c = await service.create(a.id, base({ opponentId: b.id }));

      await expect(service.accept(c.id, a.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.accept(c.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.accept(randomUUID(), b.id)).rejects.toBeInstanceOf(NotFoundException);

      const expired: any = await service
        .accept(c.id, b.id, new Date(Date.now() + 2 * 86_400_000))
        .catch((e) => e);
      expect(expired).toBeInstanceOf(ConflictException);
      expect(expired.getResponse()).toMatchObject({ code: 'EXPIRED' });
      expect((await row(c.id)).status).toBe('PENDING');
    });

    it('no se puede aceptar dos veces', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await service.accept(c.id, b.id);
      const again: any = await service.accept(c.id, b.id).catch((e) => e);
      expect(again).toBeInstanceOf(ConflictException);
      expect(again.getResponse()).toMatchObject({ code: 'NOT_PENDING' });
      expect(await balance(b.id)).toEqual({ available: 90, reserved: 10 });
    });

    it('5 personas aceptan a la vez un reto abierto: gana una sola y nadie más pierde monedas', async () => {
      const a = await newUser();
      const guests = await Promise.all(Array.from({ length: 5 }, () => newUser()));
      const c = await service.create(a.id, base());

      const results = await Promise.allSettled(guests.map((g) => service.accept(c.id, g.id)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);

      const winnerId = (await row(c.id)).opponentId!;
      expect(guests.map((g) => g.id)).toContain(winnerId);
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 }); // reservó una sola vez
      for (const g of guests) {
        expect(await balance(g.id)).toEqual(
          g.id === winnerId ? { available: 90, reserved: 10 } : { available: 100, reserved: 0 },
        );
      }
      const reserves = await prisma.walletTransaction.count({ where: { challengeId: c.id, type: 'RESERVE' } });
      expect(reserves).toBe(2);
    });

    it('10 aceptaciones simultáneas del mismo jugador: una sola reserva', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.accept(c.id, b.id)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await balance(b.id)).toEqual({ available: 90, reserved: 10 });
    });

    it('2.4 de punta a punta: invitado por link vincula WhatsApp, acepta, y el invitador gana amistad y +30', async () => {
      const inviter = await newUser(100);
      const c = await service.create(inviter.id, base());

      // El invitado se registra desde el link del reto y vincula su WhatsApp.
      const reg = await auth.instantRegister({
        displayName: 'Invitado',
        username: `i_${randomUUID().slice(0, 8)}`,
        inviteCode: c.inviteCode,
      });
      userIds.push(reg.user.id);
      const { token } = await wsp.createLinkToken(reg.user.id);
      expect((await wsp.handleIncomingMessage(phone(), token)).linked).toBe(true);
      expect((await balance(inviter.id)).available).toBe(100); // aún no activó su primer reto

      await service.accept(c.id, reg.user.id);

      const after = await balance(inviter.id);
      expect(after.available).toBe(100 - 10 + REFERRAL_COINS); // reserva -10, premio +30
      expect(after.reserved).toBe(10);
      expect((await friends.listFriends(inviter.id)).map((f) => f.id)).toContain(reg.user.id);
      expect((await friends.listFriends(reg.user.id)).map((f) => f.id)).toContain(inviter.id);
      const referral = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey: `referral:${inviter.id}:${reg.user.id}` },
      });
      expect(referral).toMatchObject({ amount: REFERRAL_COINS, type: 'REFERRAL' });
    });
  });

  // ============================================================= CANCELAR
  describe('cancelar', () => {
    it('el creador cancela un reto pendiente sin mover monedas', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));

      expect(await service.cancel(c.id, a.id)).toEqual({ challengeId: c.id, status: 'CANCELLED' });
      const r = await row(c.id);
      expect(r.status).toBe('CANCELLED');
      expect(r.closedAt).not.toBeNull();
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      expect(await eventTypes(c.id)).toEqual(['CHALLENGE_CREATED', 'CHALLENGE_CANCELLED']);
    });

    it('solo el creador puede cancelar', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await expect(service.cancel(c.id, b.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(c.id)).status).toBe('PENDING');
    });

    it('no se puede cancelar un reto ya activo ni uno ya cancelado', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await service.accept(c.id, b.id);
      await expect(service.cancel(c.id, a.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await row(c.id)).status).toBe('ACTIVE');
      expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });

      const c2 = await service.create(a.id, base({ opponentId: b.id }));
      await service.cancel(c2.id, a.id);
      await expect(service.cancel(c2.id, a.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('aceptar y cancelar a la vez: queda un solo resultado consistente', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      const results = await Promise.allSettled([service.accept(c.id, b.id), service.cancel(c.id, a.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const status = (await row(c.id)).status;
      if (status === 'ACTIVE') {
        expect(await balance(a.id)).toEqual({ available: 90, reserved: 10 });
      } else {
        expect(status).toBe('CANCELLED');
        expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
        expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      }
    });
  });

  // ============================================================== RECHAZAR
  describe('rechazar', () => {
    it('el jugador desafiado rechaza: CANCELADO sin retener monedas', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));

      expect(await service.reject(c.id, b.id)).toEqual({ challengeId: c.id, status: 'CANCELLED' });
      expect((await row(c.id)).status).toBe('CANCELLED');
      expect(await balance(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await balance(b.id)).toEqual({ available: 100, reserved: 0 });
      expect(await eventTypes(c.id)).toEqual(['CHALLENGE_CREATED', 'CHALLENGE_REJECTED']);
    });

    it('solo el jugador desafiado puede rechazar (no el creador ni un tercero)', async () => {
      const { a, b } = await newFriends();
      const other = await newUser();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await expect(service.reject(c.id, a.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.reject(c.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(c.id)).status).toBe('PENDING');
    });

    it('un reto abierto por link no se rechaza (nadie fue designado)', async () => {
      const a = await newUser();
      const guest = await newUser();
      const c = await service.create(a.id, base());
      await expect(service.reject(c.id, guest.id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no se puede rechazar un reto ya activo', async () => {
      const { a, b } = await newFriends();
      const c = await service.create(a.id, base({ opponentId: b.id }));
      await service.accept(c.id, b.id);
      await expect(service.reject(c.id, b.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await row(c.id)).status).toBe('ACTIVE');
    });

    it('un reto inexistente responde 404', async () => {
      const a = await newUser();
      await expect(service.reject(randomUUID(), a.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.cancel(randomUUID(), a.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

