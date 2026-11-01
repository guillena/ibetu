import { randomUUID } from 'node:crypto';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { ChallengesService } from './challenges.service.js';
import { ChallengeClocksService } from './clocks.service.js';
import { JudgeService } from './judge.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from './results.service.js';

// Requiere `npm run db:up` (PostgreSQL local). El tiempo se simula inyectando `now`.
describe('ChallengeClocksService – relojes con tiempo simulado (integración)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const challenges = new ChallengesService(prisma, wallet, friends);
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma));
  const judges = new JudgeService(prisma, wallet, friends, results);
  const clocks = new ChallengeClocksService(prisma, wallet, results);
  const userIds: string[] = [];
  const T0 = new Date();
  const at = (ms: number) => new Date(T0.getTime() + ms);
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'K', username: `k_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    await prisma.walletTransaction.create({
      data: { userId: u.id, currency: 'COINS', type: 'BONUS_INIT', amount: coins, idempotencyKey: `bonus_init:${u.id}` },
    });
    userIds.push(u.id);
    return u;
  }

  /** Reto ACTIVO (aceptado, monedas reservadas) que vence `expiresInMs` después de T0. */
  async function active(mode: 'COINS' | 'CASH' = 'COINS', expiresInMs = 2 * HOUR + 60_000) {
    const a = await newUser();
    const b = await newUser();
    const c = await challenges.create(a.id, {
      title: 'Emboque de papel',
      stakeAmount: mode === 'CASH' ? 5000 : 10,
      mode,
      expiresAt: new Date(T0.getTime() + expiresInMs),
    });
    await challenges.accept(c.id, b.id);
    return { id: c.id, a, b, expiresAt: new Date(T0.getTime() + expiresInMs) };
  }
  /** Reto PENDIENTE (todavía sin aceptar). */
  async function pending(expiresInMs = HOUR) {
    const a = await newUser();
    const c = await challenges.create(a.id, {
      title: 'Pendiente', stakeAmount: 10, expiresAt: new Date(T0.getTime() + expiresInMs),
    });
    return { id: c.id, a, expiresAt: new Date(T0.getTime() + expiresInMs) };
  }
  /** Disputa con Juez asignado en `assignedAt`. */
  async function disputeWithJudge(assignedAt = T0) {
    const g = await active('COINS', 30 * DAY);
    const j = await newUser(10);
    await friends.connectFriends(g.a.id, j.id);
    await results.declare(g.id, g.a.id, 'WIN', T0);
    await results.declare(g.id, g.b.id, 'WIN', T0);
    await judges.propose(g.id, g.a.id, j.id);
    await judges.approve(g.id, g.b.id, assignedAt);
    return { ...g, j };
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

  // ===================================================== 1. vencimiento
  describe('reloj 1 – vencimiento del reto sin declaraciones', () => {
    it('ACTIVO vencido y sin votos: se cancela y se devuelven 10 a cada jugador', async () => {
      const { id, a, b, expiresAt } = await active();
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });

      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');

      const c = await row(id);
      expect(c.status).toBe('CANCELLED');
      expect(c.closedAt?.getTime()).toBe(expiresAt.getTime());
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectLedger(a.id, b.id);
      const evs = await events(id);
      expect(evs).toContain('CHALLENGE_EXPIRED');
      expect(evs).toContain('COINS_REFUNDED');
      const ev = await prisma.challengeEvent.findFirstOrThrow({ where: { challengeId: id, eventType: 'CHALLENGE_EXPIRED' } });
      expect(ev.actorId).toBeNull(); // lo hizo el sistema
      expect(ev.payload).toMatchObject({ previousStatus: 'ACTIVE' });
    });

    it('el borde: un milisegundo antes del vencimiento no hace nada; en el instante exacto sí', async () => {
      const { id, a, expiresAt } = await active();
      expect(await clocks.expireChallenge(id, new Date(expiresAt.getTime() - 1))).toBe('NOT_DUE');
      expect((await row(id)).status).toBe('ACTIVE');
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });

      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect((await row(id)).status).toBe('CANCELLED');
    });

    it('PENDIENTE vencido: se cancela sin mover monedas', async () => {
      const { id, a, expiresAt } = await pending();
      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect((await row(id)).status).toBe('CANCELLED');
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await events(id)).not.toContain('COINS_REFUNDED');
    });

    it('modo Plata vencido: se cancela sin tocar monedas', async () => {
      const { id, a, b, expiresAt } = await active('CASH');
      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect((await row(id)).status).toBe('CANCELLED');
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
    });

    it('un reto con alguna declaración (RESULT) no se cancela, aunque haya vencido', async () => {
      const { id, a, b, expiresAt } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      expect(await clocks.expireChallenge(id, at(10 * DAY))).toBe('NOT_ELIGIBLE');
      expect((await row(id)).status).toBe('RESULT');
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      void b; void expiresAt;
    });

    it('en disputa, cerrado o ya cancelado no hace nada', async () => {
      const g = await active();
      await results.declare(g.id, g.a.id, 'WIN', T0);
      await results.declare(g.id, g.b.id, 'WIN', T0);
      expect(await clocks.expireChallenge(g.id, at(10 * DAY))).toBe('NOT_ELIGIBLE');
      expect((await row(g.id)).status).toBe('DISPUTE');

      const closed = await active();
      await results.declare(closed.id, closed.a.id, 'WIN', T0);
      await results.declare(closed.id, closed.b.id, 'LOSS', T0);
      expect(await clocks.expireChallenge(closed.id, at(10 * DAY))).toBe('NOT_ELIGIBLE');
      expect(await bal(closed.a.id)).toEqual({ available: 110, reserved: 0 });
    });

    it('un reto inexistente se ignora', async () => {
      expect(await clocks.expireChallenge(randomUUID(), at(DAY))).toBe('NOT_FOUND');
    });

    it('es idempotente: repetirlo no devuelve las monedas dos veces', async () => {
      const { id, a, expiresAt } = await active();
      expect(await clocks.expireChallenge(id, expiresAt)).toBe('DONE');
      expect(await clocks.expireChallenge(id, at(5 * DAY))).toBe('NOT_ELIGIBLE');
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      await expectLedger(a.id);
    });

    it('6 ejecuciones simultáneas: se devuelve una sola vez', async () => {
      const { id, a, b, expiresAt } = await active();
      const r = await Promise.all(Array.from({ length: 6 }, () => clocks.expireChallenge(id, expiresAt)));
      expect(r.filter((x) => x === 'DONE')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      expect(await prisma.walletTransaction.count({ where: { challengeId: id, type: 'REFUND' } })).toBe(2);
      await expectLedger(a.id, b.id);
    });

    it('vencimiento y primera declaración a la vez: queda un estado consistente', async () => {
      const { id, a, b, expiresAt } = await active();
      await Promise.allSettled([
        clocks.expireChallenge(id, expiresAt),
        results.declare(id, a.id, 'WIN', at(HOUR)),
      ]);
      const c = await row(id);
      if (c.status === 'CANCELLED') {
        expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
        expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      } else {
        expect(c.status).toBe('RESULT');
        expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      }
      await expectLedger(a.id, b.id);
    });
  });

  // ================================================ 2. silencio de 24 h
  describe('reloj 2 – silencio de 24 horas tras la declaración', () => {
    it('A dijo "gané" y B calla 24 h: gana A, cobra el pozo y se cierra', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);

      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');

      const c = await row(id);
      expect(c).toMatchObject({ status: 'CLOSED', winnerId: a.id });
      expect(c.closedAt?.getTime()).toBe(at(SILENCE_WINDOW_MS).getTime());
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id);

      const evs = await events(id);
      expect(evs).toEqual(expect.arrayContaining(['SILENCE_TIMEOUT', 'COINS_SETTLED', 'CHALLENGE_CLOSED']));
      const closed = await prisma.challengeEvent.findFirstOrThrow({ where: { challengeId: id, eventType: 'CHALLENGE_CLOSED' } });
      expect(closed.actorId).toBeNull();
      expect(closed.payload).toMatchObject({ resolvedBy: 'TIMEOUT', winnerId: a.id, hadDispute: false });
    });

    it('el silencio es neutro para la Credibilidad: no cuenta como derrota en disputa', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS));
      for (const u of [a, b]) expect((await user(u.id)).disputeLostCount).toBe(0);
      expect(await user(b.id)).toMatchObject({ totalPlayed: 1, totalWins: 0 });
      expect(await user(a.id)).toMatchObject({ totalPlayed: 1, totalWins: 1 });
    });

    it('funciona igual cuando quien declara es el invitado (B dice "gané", A calla)', async () => {
      const { id, a, b } = await active();
      await results.declare(id, b.id, 'WIN', T0);
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');
      expect((await row(id)).winnerId).toBe(b.id);
      expect(await bal(b.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 0 });
    });

    it('el borde: 23:59:59.999 no hace nada; a las 24:00:00 exactas sí', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS - 1))).toBe('NOT_DUE');
      expect((await row(id)).status).toBe('RESULT');
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');
    });

    it('si quien declara dijo "ganó mi rival", gana el rival que calla', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'LOSS', T0);
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');
      expect((await row(id)).winnerId).toBe(b.id);
      expect(await bal(b.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 0 });
    });

    it('si quien declara propuso "empate" y el rival calla, se devuelve el pozo', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'DRAW', T0);
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('DONE');
      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: null });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      await expectLedger(a.id, b.id);
    });

    it('en modo Plata deja el pago PENDIENTE para el ganador por silencio', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS));
      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: a.id, cashPaymentStatus: 'PENDING' });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      void b;
    });

    it('si el rival responde antes, el reloj ya no hace nada', async () => {
      const g = await active();
      await results.declare(g.id, g.a.id, 'WIN', T0);
      await results.declare(g.id, g.b.id, 'LOSS', at(HOUR)); // coincidencia: cierra
      expect(await clocks.adjudicateSilence(g.id, at(SILENCE_WINDOW_MS))).toBe('NOT_ELIGIBLE');
      expect(await bal(g.a.id)).toEqual({ available: 110, reserved: 0 }); // pagó una sola vez

      const d = await active();
      await results.declare(d.id, d.a.id, 'WIN', T0);
      await results.declare(d.id, d.b.id, 'WIN', at(HOUR)); // disputa
      expect(await clocks.adjudicateSilence(d.id, at(5 * DAY))).toBe('NOT_ELIGIBLE');
      expect((await row(d.id)).status).toBe('DISPUTE');
    });

    it('si el único votante cambia su voto, el reloj se reinicia desde el cambio', async () => {
      const { id, a } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, a.id, 'LOSS', at(10 * HOUR)); // cambió de idea

      // A las 24 h de la primera declaración todavía no vence: corre desde el cambio.
      expect(await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))).toBe('NOT_DUE');
      expect(await clocks.adjudicateSilence(id, at(10 * HOUR + SILENCE_WINDOW_MS))).toBe('DONE');
      expect((await row(id)).winnerId).not.toBe(a.id); // con "ganó mi rival" gana el rival
    });

    it('sin declaraciones o ya cerrado, no hace nada; reto inexistente se ignora', async () => {
      const { id } = await active();
      expect(await clocks.adjudicateSilence(id, at(5 * DAY))).toBe('NOT_ELIGIBLE'); // ACTIVO sin votos
      expect(await clocks.adjudicateSilence(randomUUID(), at(DAY))).toBe('NOT_FOUND');
    });

    it('es idempotente y resiste ejecuciones simultáneas: se paga una sola vez', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      const r = await Promise.all(Array.from({ length: 6 }, () => clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS))));
      expect(r.filter((x) => x === 'DONE')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      await expectLedger(a.id, b.id);
    });

    it('el reloj y la respuesta del rival a la vez: un solo cierre y un solo pago', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await Promise.allSettled([
        clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS)),
        results.declare(id, b.id, 'LOSS', at(SILENCE_WINDOW_MS)),
      ]);
      expect((await row(id)).status).toBe('CLOSED');
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id);
    });
  });

  // ===================================================== 3. Juez 48 h
  describe('reloj 3 – el Juez no falla en 48 horas', () => {
    it('se revoca su asignación y los jugadores pueden elegir a otro', async () => {
      const { id, a, b, j } = await disputeWithJudge(T0);

      expect(await clocks.revokeExpiredJudge(id, at(JUDGE_WINDOW_MS))).toBe('DONE');

      expect(await row(id)).toMatchObject({
        status: 'DISPUTE', judgeId: null, judgeProposedById: null, judgeAssignedAt: null,
        judgeApprovedByCreator: false, judgeApprovedByOpponent: false,
      });
      const ev = await prisma.challengeEvent.findFirstOrThrow({ where: { challengeId: id, eventType: 'JUDGE_EXPIRED' } });
      expect(ev.payload).toMatchObject({ judgeId: j.id });
      // La disputa y las monedas siguen como estaban.
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 10 });

      // Ya pueden proponer y aprobar a otro Juez.
      const j2 = await newUser(10);
      await friends.connectFriends(a.id, j2.id);
      await judges.propose(id, a.id, j2.id);
      const assigned = await judges.approve(id, b.id, at(JUDGE_WINDOW_MS));
      expect(assigned).toMatchObject({ judgeId: j2.id, assigned: true });
      // El Juez anterior ya no puede fallar, y el nuevo sí (y cobra).
      await expect(judges.verdict(id, j.id, a.id, at(JUDGE_WINDOW_MS + HOUR))).rejects.toThrow();
      await expect(judges.verdict(id, j2.id, a.id, at(JUDGE_WINDOW_MS + HOUR))).resolves.toMatchObject({ judgeRewarded: true });
      expect((await bal(j.id)).available).toBe(10); // el que no falló no cobró nada
      expect((await bal(j2.id)).available).toBe(15);
    });

    it('el borde: a las 47:59:59.999 no hace nada; a las 48:00 exactas sí', async () => {
      const { id } = await disputeWithJudge(T0);
      expect(await clocks.revokeExpiredJudge(id, at(JUDGE_WINDOW_MS - 1))).toBe('NOT_DUE');
      expect((await row(id)).judgeId).not.toBeNull();
      expect(await clocks.revokeExpiredJudge(id, at(JUDGE_WINDOW_MS))).toBe('DONE');
    });

    it('no revoca si el Juez ya falló, ni si solo hay una propuesta sin aprobar', async () => {
      const done = await disputeWithJudge(T0);
      await judges.verdict(done.id, done.j.id, done.a.id, at(HOUR));
      expect(await clocks.revokeExpiredJudge(done.id, at(10 * DAY))).toBe('NOT_ELIGIBLE');

      const g = await active('COINS', 30 * DAY);
      const j = await newUser(10);
      await friends.connectFriends(g.a.id, j.id);
      await results.declare(g.id, g.a.id, 'WIN', T0);
      await results.declare(g.id, g.b.id, 'WIN', T0);
      await judges.propose(g.id, g.a.id, j.id); // pendiente de aprobación: sin reloj de 48 h
      expect(await clocks.revokeExpiredJudge(g.id, at(10 * DAY))).toBe('NOT_ELIGIBLE');
      expect((await row(g.id)).judgeId).toBe(j.id);
    });

    it('es idempotente y resiste ejecuciones simultáneas', async () => {
      const { id } = await disputeWithJudge(T0);
      const r = await Promise.all(Array.from({ length: 6 }, () => clocks.revokeExpiredJudge(id, at(JUDGE_WINDOW_MS))));
      expect(r.filter((x) => x === 'DONE')).toHaveLength(1);
      expect((await events(id)).filter((e) => e === 'JUDGE_EXPIRED')).toHaveLength(1);
      expect(await clocks.revokeExpiredJudge(randomUUID(), at(JUDGE_WINDOW_MS))).toBe('NOT_FOUND');
    });

    it('el reloj y el fallo a las 48:00 a la vez: nunca quedan los dos', async () => {
      const { id, a, b, j } = await disputeWithJudge(T0);
      await Promise.allSettled([
        clocks.revokeExpiredJudge(id, at(JUDGE_WINDOW_MS)),
        judges.verdict(id, j.id, a.id, at(JUDGE_WINDOW_MS)),
      ]);
      const c = await row(id);
      if (c.status === 'CLOSED') {
        expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
        expect((await bal(j.id)).available).toBe(15);
      } else {
        expect(c.status).toBe('DISPUTE');
        expect(c.judgeId).toBeNull();
        expect(await bal(a.id)).toEqual({ available: 90, reserved: 10 });
        expect((await bal(j.id)).available).toBe(10);
      }
      await expectLedger(a.id, b.id, j.id);
    });
  });

  // ============================================== barrido periódico
  describe('barrido periódico (red de seguridad)', () => {
    it('resuelve todo lo vencido, deja intacto lo que no, y no repite trabajo', async () => {
      const exp = await active('COINS', HOUR); // vence a 1 h
      const sil = await active('COINS', 30 * DAY);
      await results.declare(sil.id, sil.a.id, 'WIN', T0);
      const jud = await disputeWithJudge(T0);
      const notDueExp = await active('COINS', 20 * DAY);
      const notDueSil = await active('COINS', 30 * DAY);
      await results.declare(notDueSil.id, notDueSil.a.id, 'WIN', at(2 * DAY)); // reloj corre hasta el día 3

      const now = at(2 * DAY + HOUR); // 2 días y 1 hora después
      const scope = [exp.id, sil.id, jud.id, notDueExp.id, notDueSil.id];
      const first = await clocks.sweepOverdue(now, scope);

      expect(first).toEqual({ expired: 1, silenced: 1, judgesRevoked: 1, failed: 0 });
      expect((await row(exp.id)).status).toBe('CANCELLED');
      expect((await row(sil.id)).status).toBe('CLOSED');
      expect((await row(jud.id)).judgeId).toBeNull();
      // Lo que todavía no venció queda como estaba.
      expect((await row(notDueExp.id)).status).toBe('ACTIVE');
      expect((await row(notDueSil.id)).status).toBe('RESULT');
      expect(await bal(exp.a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(sil.a.id)).toEqual({ available: 110, reserved: 0 });

      // Una segunda pasada no encuentra nada que hacer.
      expect(await clocks.sweepOverdue(now, scope)).toEqual({ expired: 0, silenced: 0, judgesRevoked: 0, failed: 0 });
    });

    it('con la hora correcta también resuelve lo que se había "perdido" (relojes nunca agendados)', async () => {
      const g = await active('COINS', HOUR);
      expect(await clocks.sweepOverdue(at(HOUR - 1), [g.id])).toMatchObject({ expired: 0 }); // todavía no
      expect(await clocks.sweepOverdue(at(HOUR), [g.id])).toMatchObject({ expired: 1 });
    });
  });
});

