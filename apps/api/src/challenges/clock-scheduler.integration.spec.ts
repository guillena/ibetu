import { randomUUID } from 'node:crypto';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { ChallengesService } from './challenges.service.js';
import { ClockWorker } from './clock.worker.js';
import { ChallengeClocksService } from './clocks.service.js';
import { JudgeService } from './judge.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from './results.service.js';
import { BullClockScheduler, clockJobId } from '../clocks/clock-scheduler.js';

// Requiere `npm run db:up` (PostgreSQL + Redis locales). Usa una cola exclusiva por ejecución.
describe('BullClockScheduler y ClockWorker (integración con Redis real)', () => {
  const queueName = `test-clocks-${randomUUID()}`;
  const scheduler = new BullClockScheduler({ queueName });
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma), scheduler);
  const challenges = new ChallengesService(prisma, wallet, friends, scheduler);
  const judges = new JudgeService(prisma, wallet, friends, results, scheduler);
  const clocks = new ChallengeClocksService(prisma, wallet, results, scheduler);
  const worker = new ClockWorker(clocks, scheduler);
  const userIds: string[] = [];
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'Q', username: `q_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    await prisma.walletTransaction.create({
      data: { userId: u.id, currency: 'COINS', type: 'BONUS_INIT', amount: coins, idempotencyKey: `bonus_init:${u.id}` },
    });
    userIds.push(u.id);
    return u;
  }
  async function active() {
    const a = await newUser();
    const b = await newUser();
    const c = await challenges.create(a.id, { title: 'x', stakeAmount: 10, expiresAt: new Date(Date.now() + 30 * DAY) });
    await challenges.accept(c.id, b.id);
    return { id: c.id, a, b };
  }
  const row = (id: string) => prisma.challenge.findUniqueOrThrow({ where: { id } });
  const bal = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { available: u.coinsAvailable, reserved: u.coinsReserved };
  };
  async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 6000) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (ok(v)) return v;
      if (Date.now() - t0 > timeoutMs) throw new Error('Tiempo de espera agotado');
      await sleep(100);
    }
  }
  /** Trabajos diferidos de la cola que corresponden a un reto. */
  const jobsOf = async (challengeId: string) =>
    (await scheduler.queue.getDelayed()).filter((j) => j.data?.challengeId === challengeId);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await worker.stop();
    await scheduler.queue.obliterate({ force: true });
    await scheduler.close();
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

  // ============================================================ agendado
  describe('agendado de trabajos diferidos', () => {
    it('cada reloj usa un ID determinístico (sin ":") y un retraso hasta la hora objetivo', async () => {
      const id = randomUUID();
      const at = new Date(Date.now() + 60_000);
      await scheduler.scheduleExpire(id, at);
      await scheduler.scheduleSilence(id, at);
      await scheduler.scheduleJudge(id, at);

      expect(clockJobId('expire', id)).toBe(`challenge-expire__${id}`);
      expect(clockJobId('silence', id)).toBe(`declare-timeout-24h__${id}`);
      expect(clockJobId('judge', id)).toBe(`judge-timeout-48h__${id}`);
      for (const kind of ['expire', 'silence', 'judge'] as const) {
        const job = (await scheduler.getJob(kind, id))!;
        expect(job).toBeDefined();
        expect(job.id).toBe(clockJobId(kind, id));
        expect(job.name).toBe(kind);
        expect(job.data).toEqual({ challengeId: id });
        expect(await job.getState()).toBe('delayed');
        expect(job.opts.delay).toBeGreaterThan(57_000);
        expect(job.opts.delay).toBeLessThanOrEqual(60_000);
      }
      await scheduler.cancelAll(id);
    });

    it('una hora ya pasada se agenda con retraso cero (corre enseguida)', async () => {
      const id = randomUUID();
      await scheduler.scheduleSilence(id, new Date(Date.now() - 5 * HOUR));
      const job = (await scheduler.getJob('silence', id))!;
      expect(job.opts.delay).toBe(0);
      await scheduler.cancelAll(id);
    });

    it('reagendar reemplaza al reloj anterior (no se duplica) con la nueva hora', async () => {
      const id = randomUUID();
      await scheduler.scheduleSilence(id, new Date(Date.now() + 10_000));
      await scheduler.scheduleSilence(id, new Date(Date.now() + 50_000));
      await scheduler.scheduleSilence(id, new Date(Date.now() + 90_000));

      const jobs = (await jobsOf(id)).filter((j) => j.name === 'silence');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].opts.delay).toBeGreaterThan(85_000);
      await scheduler.cancelAll(id);
    });

    it('cancelar quita solo ese reloj; cancelAll quita los tres; cancelar lo inexistente no falla', async () => {
      const id = randomUUID();
      const at = new Date(Date.now() + 60_000);
      await scheduler.scheduleExpire(id, at);
      await scheduler.scheduleSilence(id, at);
      await scheduler.scheduleJudge(id, at);

      await scheduler.cancelSilence(id);
      expect(await scheduler.getJob('silence', id)).toBeUndefined();
      expect(await scheduler.getJob('expire', id)).toBeDefined();
      expect(await scheduler.getJob('judge', id)).toBeDefined();

      await scheduler.cancelExpire(id);
      expect(await scheduler.getJob('expire', id)).toBeUndefined();
      expect(await scheduler.getJob('judge', id)).toBeDefined();

      await scheduler.scheduleExpire(id, at);
      await scheduler.cancelAll(id);
      expect(await jobsOf(id)).toHaveLength(0);
      await expect(scheduler.cancelAll(id)).resolves.toBeUndefined(); // ya no hay nada
      await expect(scheduler.cancelJudge(randomUUID())).resolves.toBeUndefined();
    });

    it('los relojes de retos distintos son independientes', async () => {
      const a = randomUUID();
      const b = randomUUID();
      const at = new Date(Date.now() + 60_000);
      await scheduler.scheduleSilence(a, at);
      await scheduler.scheduleSilence(b, at);
      await scheduler.cancelAll(a);
      expect(await jobsOf(a)).toHaveLength(0);
      expect(await jobsOf(b)).toHaveLength(1);
      await scheduler.cancelAll(b);
    });

    it('el barrido periódico se registra una sola vez aunque se pida varias', async () => {
      await scheduler.registerSweeper(60_000);
      await scheduler.registerSweeper(60_000);
      const schedulers = await scheduler.queue.getJobSchedulers();
      const sweeps = schedulers.filter((s) => s.key === 'sweep');
      expect(sweeps).toHaveLength(1);
      expect(sweeps[0].every).toBe(60_000);
      await scheduler.queue.removeJobScheduler('sweep');
    });
  });

  // ======================================================= de punta a punta
  describe('el worker ejecuta los relojes (Redis real → worker → base de datos)', () => {
    beforeAll(async () => {
      await worker.start(60_000, false); // sin barrido global: solo los relojes de estas pruebas
    });

    it('vencimiento: a la hora agendada el reto ACTIVO se cancela y se devuelve el pozo', async () => {
      const { id, a, b } = await active();
      const expiresAt = new Date(Date.now() + 500);
      await prisma.challenge.update({ where: { id }, data: { expiresAt } });
      await scheduler.scheduleExpire(id, expiresAt);

      await waitFor(() => row(id), (c) => c.status === 'CANCELLED');
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      expect(await jobsOf(id)).toHaveLength(0);
    });

    it('silencio de 24 h: a la hora agendada se adjudica al que declaró', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', new Date());
      // Se adelanta la primera declaración para que el plazo de 24 h venza en 500 ms.
      const dueAt = new Date(Date.now() + 500);
      await prisma.challenge.update({ where: { id }, data: { firstDeclaredAt: new Date(dueAt.getTime() - SILENCE_WINDOW_MS) } });
      await scheduler.scheduleSilence(id, dueAt);

      await waitFor(() => row(id), (c) => c.status === 'CLOSED');
      expect((await row(id)).winnerId).toBe(a.id);
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
    });

    it('Juez de 48 h: a la hora agendada se revoca su asignación', async () => {
      const g = await active();
      const j = await newUser(10);
      await friends.connectFriends(g.a.id, j.id);
      await results.declare(g.id, g.a.id, 'WIN', new Date());
      await results.declare(g.id, g.b.id, 'WIN', new Date());
      await judges.propose(g.id, g.a.id, j.id);
      await judges.approve(g.id, g.b.id, new Date()); // agenda el reloj real de 48 h
      expect(await scheduler.getJob('judge', g.id)).toBeDefined();

      // Se adelanta la asignación para que las 48 h venzan en 500 ms y se reagenda.
      const dueAt = new Date(Date.now() + 500);
      await prisma.challenge.update({ where: { id: g.id }, data: { judgeAssignedAt: new Date(dueAt.getTime() - JUDGE_WINDOW_MS) } });
      await scheduler.scheduleJudge(g.id, dueAt);

      await waitFor(() => row(g.id), (c) => c.judgeId === null);
      expect(await row(g.id)).toMatchObject({ status: 'DISPUTE', judgeAssignedAt: null });
    });

    it('un reloj cancelado no corre aunque llegue su hora', async () => {
      const { id } = await active();
      const expiresAt = new Date(Date.now() + 500);
      await prisma.challenge.update({ where: { id }, data: { expiresAt } });
      await scheduler.scheduleExpire(id, expiresAt);
      await scheduler.cancelExpire(id);

      await sleep(1500);
      expect((await row(id)).status).toBe('ACTIVE');
    });

    it('un trabajo que llega antes de tiempo no hace daño: el estado real manda', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', new Date()); // el plazo de 24 h recién empieza
      await scheduler.scheduleSilence(id, new Date(Date.now() - HOUR)); // agendado "ya", pero no es la hora

      await sleep(1200);
      expect((await row(id)).status).toBe('RESULT');
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
    });

    it('flujo real completo: crear agenda el vencimiento; declarar lo reemplaza por el de 24 h; cerrar cancela todo', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await challenges.create(a.id, { title: 'flujo', stakeAmount: 10, expiresAt: new Date(Date.now() + 2 * DAY) });
      expect(await scheduler.getJob('expire', c.id)).toBeDefined(); // crear agenda el vencimiento
      await challenges.accept(c.id, b.id);

      await results.declare(c.id, a.id, 'WIN', new Date());
      expect(await scheduler.getJob('expire', c.id)).toBeUndefined(); // ya hay declaración
      const silence = (await scheduler.getJob('silence', c.id))!;
      expect(silence).toBeDefined();
      expect(silence.opts.delay).toBeGreaterThan(SILENCE_WINDOW_MS - 5_000);

      await results.declare(c.id, b.id, 'LOSS', new Date()); // el rival responde: cierra
      expect(await jobsOf(c.id)).toHaveLength(0); // no queda ningún reloj
      expect((await row(c.id)).status).toBe('CLOSED');
    });
  });
});

