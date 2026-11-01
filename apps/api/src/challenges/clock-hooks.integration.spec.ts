import { randomUUID } from 'node:crypto';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { ChallengesService } from './challenges.service.js';
import { ChallengeClocksService } from './clocks.service.js';
import { JudgeService } from './judge.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from './results.service.js';

type Call = { op: string; id: string; at?: number };

/** Agendador falso que registra qué reloj se agenda o cancela, y puede fallar a pedido. */
class RecordingScheduler implements ClockScheduler {
  readonly queueName = 'recording';
  calls: Call[] = [];
  failing = false;
  private rec(op: string, id: string, at?: Date) {
    if (this.failing) throw new Error('Redis caído');
    this.calls.push({ op, id, at: at?.getTime() });
  }
  async scheduleExpire(id: string, at: Date) { this.rec('scheduleExpire', id, at); }
  async scheduleSilence(id: string, at: Date) { this.rec('scheduleSilence', id, at); }
  async scheduleJudge(id: string, at: Date) { this.rec('scheduleJudge', id, at); }
  async cancelExpire(id: string) { this.rec('cancelExpire', id); }
  async cancelSilence(id: string) { this.rec('cancelSilence', id); }
  async cancelJudge(id: string) { this.rec('cancelJudge', id); }
  async cancelAll(id: string) { this.rec('cancelAll', id); }
  async registerSweeper() { /* no-op */ }
  reset() { this.calls = []; }
  ops(id: string) { return this.calls.filter((c) => c.id === id).map((c) => c.op); }
}

// Requiere `npm run db:up` (PostgreSQL local).
describe('Ganchos de relojes: qué agenda o cancela cada acción (integración)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const sched = new RecordingScheduler();
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma), sched);
  const challenges = new ChallengesService(prisma, wallet, friends, sched);
  const judges = new JudgeService(prisma, wallet, friends, results, sched);
  const clocks = new ChallengeClocksService(prisma, wallet, results, sched);
  const userIds: string[] = [];
  const HOUR = 3_600_000;
  const T0 = new Date();
  const at = (ms: number) => new Date(T0.getTime() + ms);

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'H', username: `h_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    userIds.push(u.id);
    return u;
  }
  async function newChallenge(expiresInMs = 48 * HOUR) {
    const a = await newUser();
    const b = await newUser();
    const expiresAt = new Date(T0.getTime() + expiresInMs);
    const c = await challenges.create(a.id, { title: 'gancho', stakeAmount: 10, expiresAt });
    return { id: c.id, a, b, expiresAt };
  }
  async function active() {
    const g = await newChallenge();
    await challenges.accept(g.id, g.b.id);
    return g;
  }
  const row = (id: string) => prisma.challenge.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    await prisma.$connect();
  });
  beforeEach(() => {
    sched.reset();
    sched.failing = false;
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

  describe('crear, cancelar y rechazar', () => {
    it('crear agenda el vencimiento exactamente a la fecha del reto', async () => {
      const { id, expiresAt } = await newChallenge();
      expect(sched.calls).toEqual([{ op: 'scheduleExpire', id, at: expiresAt.getTime() }]);
    });

    it('aceptar no cambia los relojes (el vencimiento ya estaba agendado)', async () => {
      const { id, b } = await newChallenge();
      sched.reset();
      await challenges.accept(id, b.id);
      expect(sched.ops(id)).toEqual([]);
    });

    it('cancelar y rechazar cancelan todos los relojes del reto', async () => {
      const a = await newUser();
      const b = await newUser();
      await friends.connectFriends(a.id, b.id);
      const c1 = await challenges.create(a.id, { title: 'x', stakeAmount: 10, expiresAt: at(48 * HOUR) });
      const c2 = await challenges.create(a.id, { title: 'y', stakeAmount: 10, expiresAt: at(48 * HOUR), opponentId: b.id });
      sched.reset();
      await challenges.cancel(c1.id, a.id);
      await challenges.reject(c2.id, b.id);
      expect(sched.ops(c1.id)).toEqual(['cancelAll']);
      expect(sched.ops(c2.id)).toEqual(['cancelAll']);
    });
  });

  describe('declarar resultado', () => {
    it('la primera declaración deja de lado el vencimiento y agenda las 24 h exactas', async () => {
      const { id, a } = await active();
      sched.reset();
      await results.declare(id, a.id, 'WIN', T0);
      expect(sched.calls).toEqual([
        { op: 'cancelExpire', id, at: undefined },
        { op: 'scheduleSilence', id, at: T0.getTime() + SILENCE_WINDOW_MS },
      ]);
    });

    it('si el único votante cambia su voto, el reloj de 24 h se reagenda desde el cambio', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      sched.reset();
      await results.declare(id, a.id, 'DRAW', at(10 * HOUR));
      expect(sched.calls.find((c) => c.op === 'scheduleSilence')?.at).toBe(at(10 * HOUR).getTime() + SILENCE_WINDOW_MS);
    });

    it('repetir el mismo voto no toca ningún reloj', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      sched.reset();
      await results.declare(id, a.id, 'WIN', at(HOUR));
      expect(sched.calls).toEqual([]);
    });

    it('si el rival responde y coinciden, se cancelan todos los relojes', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      sched.reset();
      await results.declare(id, b.id, 'LOSS', at(HOUR));
      expect(sched.ops(id)).toEqual(['cancelAll']);
    });

    it('si el rival responde y se contradicen (disputa), ya no corre el de 24 h ni el vencimiento', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      sched.reset();
      await results.declare(id, b.id, 'WIN', at(HOUR));
      expect(sched.ops(id)).toEqual(['cancelExpire', 'cancelSilence']);
    });

    it('una declaración rechazada (voto inválido o reto ajeno) no toca los relojes', async () => {
      const { id, a } = await active();
      sched.reset();
      await expect(results.declare(id, a.id, 'TIE' as any, T0)).rejects.toThrow();
      expect(sched.calls).toEqual([]);
    });
  });

  describe('Juez', () => {
    async function dispute() {
      const g = await active();
      const j = await newUser(10);
      await friends.connectFriends(g.a.id, j.id);
      await results.declare(g.id, g.a.id, 'WIN', T0);
      await results.declare(g.id, g.b.id, 'WIN', T0);
      return { ...g, j };
    }

    it('proponer no agenda nada; aprobar agenda las 48 h exactas desde la asignación', async () => {
      const { id, a, b, j } = await dispute();
      sched.reset();
      await judges.propose(id, a.id, j.id);
      expect(sched.calls).toEqual([]);
      await judges.approve(id, b.id, T0);
      expect(sched.calls).toEqual([{ op: 'scheduleJudge', id, at: T0.getTime() + JUDGE_WINDOW_MS }]);
    });

    it('el fallo del Juez cancela todos los relojes', async () => {
      const { id, a, b, j } = await dispute();
      await judges.propose(id, a.id, j.id);
      await judges.approve(id, b.id, T0);
      sched.reset();
      await judges.verdict(id, j.id, a.id, at(HOUR));
      expect(sched.ops(id)).toEqual(['cancelAll']);
    });

    it('un fallo rechazado (fuera de plazo) no cancela nada', async () => {
      const { id, a, b, j } = await dispute();
      await judges.propose(id, a.id, j.id);
      await judges.approve(id, b.id, T0);
      sched.reset();
      await expect(judges.verdict(id, j.id, a.id, at(JUDGE_WINDOW_MS + 1))).rejects.toThrow();
      expect(sched.calls).toEqual([]);
    });
  });

  describe('los propios relojes limpian al cerrar', () => {
    it('vencer un reto cancela el resto de sus relojes', async () => {
      const { id, expiresAt } = await active();
      sched.reset();
      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect(sched.ops(id)).toEqual(['cancelAll']);
    });

    it('adjudicar por silencio cancela el resto; una ejecución sin efecto no toca nada', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      sched.reset();
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS - 1))).toBe('NOT_DUE');
      expect(sched.calls).toEqual([]);
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');
      expect(sched.ops(id)).toEqual(['cancelAll']);
    });
  });

  describe('si el agendador falla (Redis caído), la acción del usuario igual se completa', () => {
    it('crear, aceptar, declarar, cerrar y cancelar siguen funcionando', async () => {
      sched.failing = true;

      const a = await newUser();
      const b = await newUser();
      const created = await challenges.create(a.id, { title: 'resiliente', stakeAmount: 10, expiresAt: at(48 * HOUR) });
      expect(created.status).toBe('PENDING'); // se creó aunque no se pudo agendar el vencimiento

      await challenges.accept(created.id, b.id);
      await results.declare(created.id, a.id, 'WIN', T0);
      const closed = await results.declare(created.id, b.id, 'LOSS', at(HOUR));
      expect(closed.status).toBe('CLOSED');
      expect((await row(created.id)).winnerId).toBe(a.id);

      const other = await challenges.create(a.id, { title: 'otro', stakeAmount: 10, expiresAt: at(48 * HOUR) });
      await expect(challenges.cancel(other.id, a.id)).resolves.toMatchObject({ status: 'CANCELLED' });
    });

    it('aprobar al Juez y el fallo siguen funcionando', async () => {
      const g = await active();
      const j = await newUser(10);
      await friends.connectFriends(g.a.id, j.id);
      await results.declare(g.id, g.a.id, 'WIN', T0);
      await results.declare(g.id, g.b.id, 'WIN', T0);
      await judges.propose(g.id, g.a.id, j.id);

      sched.failing = true;
      await expect(judges.approve(g.id, g.b.id, T0)).resolves.toMatchObject({ assigned: true });
      await expect(judges.verdict(g.id, j.id, g.a.id, at(HOUR))).resolves.toMatchObject({ status: 'CLOSED' });
    });

    it('los relojes de cierre tampoco fallan: el reto igual se cancela', async () => {
      const { id, expiresAt } = await active();
      sched.failing = true;
      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect((await row(id)).status).toBe('CANCELLED');
    });
  });
});

