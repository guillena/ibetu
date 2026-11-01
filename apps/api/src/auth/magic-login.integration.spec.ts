import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WhatsappService } from '../whatsapp/whatsapp.service.js';

// Requiere `npm run db:up` (PostgreSQL + Redis locales).
describe('Magic Link vía WhatsApp (integración con PostgreSQL y Redis)', () => {
  const prisma = new PrismaService();
  const redis = new RedisService();
  const jwt = new JwtService({ secret: 'test', signOptions: { expiresIn: '1h' } });
  const auth = new AuthService(prisma, jwt, redis);
  const wsp = new WhatsappService(prisma, redis, auth, new FriendsService(prisma));
  const createdUserIds: string[] = [];
  const phone = () => `54911${Math.floor(10000000 + Math.random() * 89999999)}`;

  async function linkedUser() {
    const user = await prisma.user.create({
      data: {
        displayName: 'Magic',
        username: `m_${randomUUID().slice(0, 8)}`,
        coinsAvailable: 100,
        whatsappPhone: phone(),
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await redis.onModuleDestroy();
  });

  it('número vinculado pide "Entrar" por WhatsApp y recibe un Magic Link que inicia sesión', async () => {
    const user = await linkedUser();
    const res = await wsp.handleIncomingMessage(user.whatsappPhone!, 'Entrar a mi cuenta');

    expect(res).toMatchObject({ linked: true, loginLinkSent: true, userId: user.id });
    expect(res.reply).toContain(res.magicLink!);

    const token = new URL(res.magicLink!).searchParams.get('token')!;
    const session = await auth.magicLogin(token);
    expect(session.user.id).toBe(user.id);
    const payload = await jwt.verifyAsync(session.accessToken);
    expect(payload.sub).toBe(user.id);
  });

  it('el Magic Link es de un solo uso', async () => {
    const user = await linkedUser();
    const { token } = await auth.createMagicLink(user.id);

    await expect(auth.magicLogin(token)).resolves.toBeDefined();
    await expect(auth.magicLogin(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dos canjes simultáneos del mismo enlace: solo uno entra', async () => {
    const user = await linkedUser();
    const { token } = await auth.createMagicLink(user.id);

    const results = await Promise.allSettled([auth.magicLogin(token), auth.magicLogin(token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('expira: tiene TTL de 10 minutos y un token vencido es rechazado', async () => {
    const user = await linkedUser();
    const { token, expiresInSeconds } = await auth.createMagicLink(user.id);
    expect(expiresInSeconds).toBe(600);

    // TTL real aplicado en Redis (<= 600 s y > 0).
    const client = (redis as any).client;
    const ttl = await client.ttl(`magic:${token}`);
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);

    // Expiración efectiva: una clave con TTL de 1 s deja de ser canjeable.
    const shortToken = `short_${randomUUID()}`;
    await redis.set(`magic:${shortToken}`, user.id, 1);
    await new Promise((r) => setTimeout(r, 1300));
    await expect(auth.magicLogin(shortToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza tokens inexistentes o vacíos', async () => {
    await expect(auth.magicLogin('no-existe')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.magicLogin('')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un número NO vinculado que pide "Entrar" no recibe enlace', async () => {
    const res = await wsp.handleIncomingMessage(phone(), 'Entrar');
    expect(res).toMatchObject({ linked: false, reason: 'NOT_LINKED' });
    expect(res.magicLink).toBeUndefined();
  });
});
