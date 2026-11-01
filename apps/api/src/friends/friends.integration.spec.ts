import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WhatsappService } from '../whatsapp/whatsapp.service.js';
import { FriendsService, REFERRAL_COINS } from './friends.service.js';

// Requiere `npm run db:up` (PostgreSQL + Redis locales).
describe('Amigos y premio por viralidad (integración con PostgreSQL y Redis)', () => {
  const prisma = new PrismaService();
  const redis = new RedisService();
  const auth = new AuthService(prisma, new JwtService({ secret: 'test' }), redis);
  const friends = new FriendsService(prisma);
  const wsp = new WhatsappService(prisma, redis, auth, friends);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const phone = () => `54911${Math.floor(10000000 + Math.random() * 89999999)}`;

  async function newUser(extra: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        displayName: 'U',
        username: `f_${randomUUID().slice(0, 8)}`,
        coinsAvailable: 50,
        ...extra,
      },
    });
    userIds.push(user.id);
    return user;
  }

  /** Reto con un código de invitación (estado configurable). */
  async function newChallenge(creatorId: string, opponentId: string | null, status: any = 'PENDING') {
    const c = await prisma.challenge.create({
      data: {
        inviteCode: randomUUID().slice(0, 10),
        title: '¿A que no embocás el papel en el cesto?',
        creatorId,
        opponentId,
        stakeAmount: 10,
        status,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    challengeIds.push(c.id);
    return c;
  }

  /** Registra al invitado vía el flujo real de alta usando el link del reto. */
  async function registerInvitee(inviteCode: string) {
    const res = await auth.instantRegister({
      displayName: 'Invitado',
      username: `i_${randomUUID().slice(0, 8)}`,
      inviteCode,
    });
    userIds.push(res.user.id);
    return res.user.id;
  }

  async function linkWhatsapp(userId: string) {
    const { token } = await wsp.createLinkToken(userId);
    const r = await wsp.handleIncomingMessage(phone(), token);
    expect(r.linked).toBe(true);
  }

  const coins = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).coinsAvailable;
  const referralTxs = (inviterId: string) =>
    prisma.walletTransaction.findMany({ where: { userId: inviterId, type: 'REFERRAL' } });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
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

  it('crea amistad bidireccional: ambos aparecen en la lista del otro, sin duplicar', async () => {
    const a = await newUser();
    const b = await newUser();

    await friends.connectFriends(a.id, b.id);
    await friends.connectFriends(b.id, a.id); // en sentido inverso: no duplica

    const listA = await friends.listFriends(a.id);
    const listB = await friends.listFriends(b.id);
    expect(listA.map((f) => f.id)).toEqual([b.id]);
    expect(listB.map((f) => f.id)).toEqual([a.id]);
    expect(listA[0]).toMatchObject({ username: b.username, displayName: 'U' });
  });

  it('ignora la amistad de un usuario consigo mismo', async () => {
    const a = await newUser();
    await friends.connectFriends(a.id, a.id);
    expect(await friends.listFriends(a.id)).toEqual([]);
  });

  it('el registro por link de un reto atribuye al invitador', async () => {
    const inviter = await newUser();
    const challenge = await newChallenge(inviter.id, null);
    const inviteeId = await registerInvitee(challenge.inviteCode);

    const invitee = await prisma.user.findUniqueOrThrow({ where: { id: inviteeId } });
    expect(invitee.invitedById).toBe(inviter.id);
  });

  it('al aceptar el reto: amistad + premio de +30 cuando ya vinculó WhatsApp (una sola vez)', async () => {
    const inviter = await newUser();
    const challenge = await newChallenge(inviter.id, null);
    const inviteeId = await registerInvitee(challenge.inviteCode);
    await linkWhatsapp(inviteeId);
    expect(await coins(inviter.id)).toBe(50); // aún sin primer reto activo

    // El invitado acepta: el reto pasa a ACTIVO.
    await prisma.challenge.update({
      where: { id: challenge.id },
      data: { opponentId: inviteeId, status: 'ACTIVE' },
    });
    const first = await friends.onChallengeAccepted(inviter.id, inviteeId);
    expect(first.referralGranted).toBe(true);
    expect(await coins(inviter.id)).toBe(50 + REFERRAL_COINS);

    // Amistad creada en ambos sentidos.
    expect((await friends.listFriends(inviter.id)).map((f) => f.id)).toContain(inviteeId);
    expect((await friends.listFriends(inviteeId)).map((f) => f.id)).toContain(inviter.id);

    // Idempotencia: repetir no vuelve a pagar.
    const again = await friends.onChallengeAccepted(inviter.id, inviteeId);
    expect(again.referralGranted).toBe(false);
    expect(await coins(inviter.id)).toBe(50 + REFERRAL_COINS);
    const txs = await referralTxs(inviter.id);
    expect(txs).toHaveLength(1);
    expect(txs[0].idempotencyKey).toBe(`referral:${inviter.id}:${inviteeId}`);
  });

  it('también premia si primero activa el reto y recién después vincula WhatsApp', async () => {
    const inviter = await newUser();
    const challenge = await newChallenge(inviter.id, null);
    const inviteeId = await registerInvitee(challenge.inviteCode);

    await prisma.challenge.update({
      where: { id: challenge.id },
      data: { opponentId: inviteeId, status: 'ACTIVE' },
    });
    const early = await friends.onChallengeAccepted(inviter.id, inviteeId);
    expect(early.referralGranted).toBe(false); // todavía sin WhatsApp
    expect(await coins(inviter.id)).toBe(50);

    await linkWhatsapp(inviteeId); // completa la condición
    expect(await coins(inviter.id)).toBe(50 + REFERRAL_COINS);
    expect(await referralTxs(inviter.id)).toHaveLength(1);
  });

  it('no premia sin invitador (alta directa) ni con un reto sin activar', async () => {
    const direct = await newUser({ whatsappPhone: phone() });
    expect(await friends.tryGrantReferral(direct.id)).toBe(false);

    const inviter = await newUser();
    const challenge = await newChallenge(inviter.id, null, 'PENDING');
    const inviteeId = await registerInvitee(challenge.inviteCode);
    await linkWhatsapp(inviteeId);
    expect(await friends.tryGrantReferral(inviteeId)).toBe(false);
    expect(await coins(inviter.id)).toBe(50);
  });

  it('llamados concurrentes no pagan el premio dos veces', async () => {
    const inviter = await newUser();
    const challenge = await newChallenge(inviter.id, null);
    const inviteeId = await registerInvitee(challenge.inviteCode);
    await linkWhatsapp(inviteeId);
    await prisma.challenge.update({
      where: { id: challenge.id },
      data: { opponentId: inviteeId, status: 'ACTIVE' },
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => friends.tryGrantReferral(inviteeId)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await coins(inviter.id)).toBe(50 + REFERRAL_COINS);
    expect(await referralTxs(inviter.id)).toHaveLength(1);
  });
});

