import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  JUDGE_REWARD_COINS,
  LIFELINE_COINS,
  LIFELINE_COOLDOWN_MS,
  JUDGE_WINDOW_MS,
  LifelineNotAllowedException,
  WalletService,
} from './wallet.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('Salvavidas y recompensa del Juez (integración con PostgreSQL)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const T0 = new Date('2026-11-01T12:00:00-03:00');
  const hours = (n: number) => n * 60 * 60 * 1000;

  async function newUser(coins: number, reserved = 0) {
    const user = await prisma.user.create({
      data: {
        displayName: 'L',
        username: `l_${randomUUID().slice(0, 8)}`,
        coinsAvailable: coins,
        coinsReserved: reserved,
      },
    });
    userIds.push(user.id);
    return user;
  }
  const reload = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
  const claimReason = async (id: string, now = T0) => {
    const err: any = await wallet.claimLifeline(id, now).catch((e) => e);
    return err instanceof LifelineNotAllowedException ? err.getResponse() : err;
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('Salvavidas', () => {
    it('con menos de 10 monedas y sin reservas acredita +20 y registra el asiento', async () => {
      const u = await newUser(5);
      const res = await wallet.claimLifeline(u.id, T0);

      expect(res.granted).toBe(LIFELINE_COINS);
      expect(res.coinsAvailable).toBe(25);
      expect(res.nextAvailableAt.getTime()).toBe(T0.getTime() + LIFELINE_COOLDOWN_MS);
      const after = await reload(u.id);
      expect(after.coinsAvailable).toBe(25);
      expect(after.lastLifelineAt?.getTime()).toBe(T0.getTime());
      const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'LIFELINE' } });
      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(20);
    });

    it('el borde del umbral: 9 monedas sí, 10 monedas no', async () => {
      const nine = await newUser(9);
      await expect(wallet.claimLifeline(nine.id, T0)).resolves.toMatchObject({ granted: 20 });

      const ten = await newUser(10);
      expect(await claimReason(ten.id)).toMatchObject({ code: 'BALANCE_NOT_LOW' });
      expect((await reload(ten.id)).coinsAvailable).toBe(10);
    });

    it('con saldo cero también puede pedirlo', async () => {
      const u = await newUser(0);
      await expect(wallet.claimLifeline(u.id, T0)).resolves.toMatchObject({ coinsAvailable: 20 });
    });

    it('se rechaza si tiene monedas reservadas en retos activos', async () => {
      const u = await newUser(0, 5); // saldo total 5 (< 10) pero hay reserva
      expect(await claimReason(u.id)).toMatchObject({ code: 'HAS_RESERVED_COINS' });
      expect((await reload(u.id)).coinsAvailable).toBe(0);
    });

    it('el saldo total incluye lo reservado: 3 disponibles + 8 reservadas no califica', async () => {
      const u = await newUser(3, 8);
      const reason = await claimReason(u.id);
      expect(reason.code).toBe('HAS_RESERVED_COINS');
    });

    it('máximo una vez cada 24 h: a las 23:59 se rechaza y a las 24:00 se permite', async () => {
      const u = await newUser(5);
      await wallet.claimLifeline(u.id, T0);
      await prisma.user.update({ where: { id: u.id }, data: { coinsAvailable: 3 } }); // vuelve a quedar sin monedas

      const early = await claimReason(u.id, new Date(T0.getTime() + LIFELINE_COOLDOWN_MS - 60_000));
      expect(early).toMatchObject({ code: 'COOLDOWN' });
      expect(new Date(early.nextAvailableAt).getTime()).toBe(T0.getTime() + LIFELINE_COOLDOWN_MS);
      expect((await reload(u.id)).coinsAvailable).toBe(3);

      const ok = await wallet.claimLifeline(u.id, new Date(T0.getTime() + LIFELINE_COOLDOWN_MS));
      expect(ok.coinsAvailable).toBe(23);
      const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'LIFELINE' } });
      expect(txs).toHaveLength(2);
    });

    it('pedidos simultáneos: se cobra una sola vez', async () => {
      const u = await newUser(0);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => wallet.claimLifeline(u.id, T0)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
      expect((await reload(u.id)).coinsAvailable).toBe(20);
      const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'LIFELINE' } });
      expect(txs).toHaveLength(1);
    });
  });

  describe('Recompensa del Juez', () => {
    async function disputeWithJudge(assignedAt: Date | null = T0, judgeIsPlayer = false) {
      const creator = await newUser(100);
      const opponent = await newUser(100);
      const judge = await newUser(100);
      const c = await prisma.challenge.create({
        data: {
          inviteCode: randomUUID().slice(0, 10),
          title: 'disputa',
          creatorId: creator.id,
          opponentId: opponent.id,
          judgeId: judgeIsPlayer ? creator.id : judge.id,
          judgeAssignedAt: assignedAt,
          stakeAmount: 10,
          status: 'DISPUTE',
          expiresAt: new Date(T0.getTime() + hours(24)),
        },
      });
      challengeIds.push(c.id);
      return { c, judge, creator };
    }
    const coins = async (id: string) => (await reload(id)).coinsAvailable;

    it('+5 monedas al Juez que falla dentro de las 48 h', async () => {
      const { c, judge } = await disputeWithJudge();
      const ok = await wallet.rewardJudge(c.id, judge.id, new Date(T0.getTime() + hours(10)));
      expect(ok).toBe(true);
      expect(await coins(judge.id)).toBe(100 + JUDGE_REWARD_COINS);
      const tx = await prisma.walletTransaction.findUniqueOrThrow({
        where: { idempotencyKey: `judge_reward:${c.id}:${judge.id}` },
      });
      expect(tx).toMatchObject({ type: 'JUDGE', amount: 5, challengeId: c.id });
    });

    it('el borde de las 48 h: exactamente 48:00 premia, 48:00:01 no', async () => {
      const onTime = await disputeWithJudge();
      expect(await wallet.rewardJudge(onTime.c.id, onTime.judge.id, new Date(T0.getTime() + JUDGE_WINDOW_MS))).toBe(true);

      const late = await disputeWithJudge();
      expect(await wallet.rewardJudge(late.c.id, late.judge.id, new Date(T0.getTime() + JUDGE_WINDOW_MS + 1000))).toBe(false);
      expect(await coins(late.judge.id)).toBe(100);
    });

    it('no paga dos veces por el mismo reto, ni siquiera en paralelo', async () => {
      const { c, judge } = await disputeWithJudge();
      const at = new Date(T0.getTime() + hours(1));
      const results = await Promise.all(
        Array.from({ length: 8 }, () => wallet.rewardJudge(c.id, judge.id, at)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await coins(judge.id)).toBe(105);
    });

    it('no premia a quien no es el Juez asignado del reto', async () => {
      const { c } = await disputeWithJudge();
      const stranger = await newUser(100);
      expect(await wallet.rewardJudge(c.id, stranger.id, new Date(T0.getTime() + hours(1)))).toBe(false);
      expect(await coins(stranger.id)).toBe(100);
    });

    it('no premia si el "Juez" es uno de los jugadores', async () => {
      const { c, creator } = await disputeWithJudge(T0, true);
      expect(await wallet.rewardJudge(c.id, creator.id, new Date(T0.getTime() + hours(1)))).toBe(false);
    });

    it('no premia si el Juez nunca fue designado (sin fecha de asignación) ni con fecha anterior', async () => {
      const unassigned = await disputeWithJudge(null);
      expect(await wallet.rewardJudge(unassigned.c.id, unassigned.judge.id, T0)).toBe(false);

      const { c, judge } = await disputeWithJudge();
      expect(await wallet.rewardJudge(c.id, judge.id, new Date(T0.getTime() - 1000))).toBe(false);
    });

    it('un reto inexistente no premia', async () => {
      const judge = await newUser(100);
      expect(await wallet.rewardJudge(randomUUID(), judge.id, T0)).toBe(false);
    });
  });
});

