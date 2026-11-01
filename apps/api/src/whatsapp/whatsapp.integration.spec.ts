import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WhatsappService } from './whatsapp.service.js';

// Requiere `npm run db:up` (PostgreSQL + Redis locales).
describe('WhatsappService (integración con PostgreSQL y Redis)', () => {
  const prisma = new PrismaService();
  const redis = new RedisService();
  const auth = new AuthService(prisma, new JwtService({ secret: 'test' }), redis);
  const service = new WhatsappService(prisma, redis, auth, new FriendsService(prisma));
  const createdUserIds: string[] = [];

  async function newUser(initialCoins = 50) {
    const username = `t_${randomUUID().slice(0, 8)}`;
    const user = await prisma.user.create({
      data: { displayName: 'Test', username, coinsAvailable: initialCoins },
    });
    createdUserIds.push(user.id);
    return user;
  }
  const phone = () => `54911${Math.floor(10000000 + Math.random() * 89999999)}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await redis.onModuleDestroy();
  });

  it('genera un enlace wa.me con el código y TTL de 15 minutos', async () => {
    const user = await newUser();
    const res = await service.createLinkToken(user.id);
    expect(res.token).toMatch(/^VINC-[A-Z0-9]{6}$/);
    expect(res.waUrl).toContain('https://wa.me/');
    expect(decodeURIComponent(res.waUrl)).toContain(`#${res.token}`);
    expect(res.expiresInSeconds).toBe(900);
  });

  it('vincula el teléfono remitente y acredita +50 monedas una única vez', async () => {
    const user = await newUser(50);
    const from = phone();

    const { token } = await service.createLinkToken(user.id);
    const first = await service.handleIncomingMessage(from, `Vincular mi cuenta IBetU #${token}`);
    expect(first).toMatchObject({ linked: true, userId: user.id, bonusGranted: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappPhone).toBe(from);
    expect(after.coinsAvailable).toBe(100);

    // Nuevo código para el mismo usuario: se vincula de nuevo pero NO repite el bono.
    const again = await service.createLinkToken(user.id);
    const second = await service.handleIncomingMessage(from, again.token);
    expect(second).toMatchObject({ linked: true, bonusGranted: false });

    const final = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(final.coinsAvailable).toBe(100);
    const txs = await prisma.walletTransaction.findMany({
      where: { userId: user.id, type: 'BONUS_WSP' },
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].idempotencyKey).toBe(`bonus_wsp:${user.id}`);
  });

  it('el código es de un solo uso', async () => {
    const user = await newUser();
    const { token } = await service.createLinkToken(user.id);
    const ok = await service.handleIncomingMessage(phone(), token);
    expect(ok.linked).toBe(true);

    const reuse = await service.handleIncomingMessage(phone(), token);
    expect(reuse).toMatchObject({ linked: false, reason: 'INVALID_TOKEN' });
  });

  it('rechaza códigos inexistentes o mensajes sin código y no vincula nada', async () => {
    const user = await newUser();
    const bad = await service.handleIncomingMessage(phone(), 'Vincular #VINC-ZZZZZZ');
    expect(bad).toMatchObject({ linked: false, reason: 'INVALID_TOKEN' });
    const none = await service.handleIncomingMessage(phone(), 'hola');
    expect(none).toMatchObject({ linked: false, reason: 'INVALID_TOKEN' });

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.whatsappPhone).toBeNull();
  });

  it('un código vencido (sin clave en Redis) no vincula', async () => {
    const user = await newUser();
    const { token } = await service.createLinkToken(user.id);
    await redis.getdel(`wsplink:${token}`); // simula expiración del TTL
    const res = await service.handleIncomingMessage(phone(), token);
    expect(res).toMatchObject({ linked: false, reason: 'INVALID_TOKEN' });
  });

  it('no permite vincular un número que ya pertenece a otra cuenta', async () => {
    const a = await newUser();
    const b = await newUser();
    const shared = phone();

    const ta = await service.createLinkToken(a.id);
    await service.handleIncomingMessage(shared, ta.token);

    const tb = await service.createLinkToken(b.id);
    const res = await service.handleIncomingMessage(shared, tb.token);
    expect(res).toMatchObject({ linked: false, reason: 'PHONE_IN_USE' });
    const bAfter = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(bAfter.whatsappPhone).toBeNull();
  });
});

