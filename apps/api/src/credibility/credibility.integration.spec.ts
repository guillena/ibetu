import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CASH_PAYMENT_GRACE_MS, CashPaymentService } from '../cash-payments/cash-payment.service.js';
import { ChallengeClocksService } from '../challenges/clocks.service.js';
import { ChallengesService } from '../challenges/challenges.service.js';
import { JudgeService } from '../challenges/judge.service.js';
import { ChallengeResultsService, SILENCE_WINDOW_MS } from '../challenges/results.service.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService } from '../wallet/streak.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { computeScore } from './credibility.js';
import { CredibilityService, recordCredibilityEvent } from './credibility.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('Credibilidad – hechos y puntaje con los flujos reales (integración)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const challenges = new ChallengesService(prisma, wallet, friends);
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma));
  const judges = new JudgeService(prisma, wallet, friends, results);
  const clocks = new ChallengeClocksService(prisma, wallet, results);
  const cash = new CashPaymentService(prisma);
  const credibility = new CredibilityService(prisma);
  const userIds: string[] = [];
  const T0 = new Date();
  const at = (ms: number) => new Date(T0.getTime() + ms);
  const DAY = 86_400_000;

  async function newUser(coins = 100, extra: Record<string, unknown> = {}) {
    const u = await prisma.user.create({
      data: { displayName: 'C', username: `cr_${randomUUID().slice(0, 8)}`, coinsAvailable: coins, ...extra },
    });
    userIds.push(u.id);
    return u;
  }

  async function active(mode: 'COINS' | 'CASH' = 'COINS', aExtra: Record<string, unknown> = {}, bExtra: Record<string, unknown> = {}) {
    const a = await newUser(100, aExtra);
    const b = await newUser(100, bExtra);
    const c = await challenges.create(a.id, {
      title: 'Partida', mode, stakeAmount: mode === 'CASH' ? 5000 : 10, expiresAt: new Date(Date.now() + 30 * DAY),
    });
    await challenges.accept(c.id, b.id);
    return { id: c.id, a, b };
  }
  /** Disputa con Juez asignado; `voteA` / `voteB` definen la contradicción. */
  async function judged(voteA: 'WIN' | 'LOSS' | 'DRAW', voteB: 'WIN' | 'LOSS' | 'DRAW', mode: 'COINS' | 'CASH' = 'COINS', aExtra = {}) {
    const g = await active(mode, aExtra);
    const j = await newUser(10);
    await friends.connectFriends(g.a.id, j.id);
    await results.declare(g.id, g.a.id, voteA, T0);
    await results.declare(g.id, g.b.id, voteB, T0);
    await judges.propose(g.id, g.a.id, j.id);
    await judges.approve(g.id, g.b.id, T0);
    return { ...g, j };
  }

  const cred = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return {
      clean: u.cleanClosedCount, lost: u.disputeLostCount, defaults: u.paymentDefaultCount, score: u.credibilityScore,
    };
  };
  const eventsOf = (challengeId: string) =>
    prisma.credibilityEvent.findMany({ where: { challengeId }, orderBy: { type: 'asc' } });
  /** El puntaje guardado siempre debe coincidir con la fórmula aplicada a los contadores. */
  async function expectConsistent(...ids: string[]) {
    for (const id of ids) {
      const c = await cred(id);
      expect(c.score).toBe(computeScore(c.clean, c.lost + c.defaults));
    }
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
    await prisma.challenge.deleteMany({ where: { id: { in: ids } } }); // arrastra los asientos de credibilidad
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { invitedById: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // ============================================ acuerdos limpios (sube/mantiene)
  describe('cierre de común acuerdo', () => {
    it('el que gana y el que pierde suman un acuerdo limpio; nadie baja', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);

      expect(await cred(a.id)).toEqual({ clean: 1, lost: 0, defaults: 0, score: 100 });
      expect(await cred(b.id)).toEqual({ clean: 1, lost: 0, defaults: 0, score: 100 });
      const evs = await eventsOf(id);
      expect(evs.map((e) => [e.type, e.idempotencyKey])).toEqual(
        expect.arrayContaining([
          ['CLEAN_AGREEMENT', `cred:CLEAN_AGREEMENT:${id}:${a.id}`],
          ['CLEAN_AGREEMENT', `cred:CLEAN_AGREEMENT:${id}:${b.id}`],
        ]),
      );
      expect(evs).toHaveLength(2);
    });

    it('perder NO baja la credibilidad: quien reconoce su derrota mantiene o mejora su puntaje', async () => {
      // El perdedor ya arrastra un incumplimiento previo (puntaje 67).
      const prior = { cleanClosedCount: 10, disputeLostCount: 1, credibilityScore: computeScore(10, 1) };
      const { id, a, b } = await active('COINS', {}, prior);
      expect((await cred(b.id)).score).toBe(67);

      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0); // B pierde y lo reconoce

      const after = await cred(b.id);
      expect(after).toMatchObject({ clean: 11, lost: 1, score: computeScore(11, 1) });
      expect(after.score).toBeGreaterThanOrEqual(67); // sube, no baja
      expect(after.score).toBe(69);
      await expectConsistent(a.id, b.id);
    });

    it('un empate de común acuerdo también es un acuerdo limpio para ambos', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'DRAW', T0);
      await results.declare(id, b.id, 'DRAW', T0);
      expect((await cred(a.id)).clean).toBe(1);
      expect((await cred(b.id)).clean).toBe(1);
      expect(await eventsOf(id)).toHaveLength(2);
    });

    it('ambos reconociendo "ganó mi rival" (sin culpables) tampoco penaliza', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'LOSS', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      expect(await cred(a.id)).toMatchObject({ clean: 1, lost: 0, score: 100 });
      expect(await cred(b.id)).toMatchObject({ clean: 1, lost: 0, score: 100 });
    });

    it('en modo Plata también cuenta el acuerdo al cerrar', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      expect((await cred(a.id)).clean).toBe(1);
      expect((await cred(b.id)).clean).toBe(1);
    });

    it('el historial acumulado sube el puntaje de forma gradual tras un incumplimiento', async () => {
      const a = await newUser(100, { cleanClosedCount: 0, disputeLostCount: 1, credibilityScore: 0 });
      const scores = [0];
      for (let i = 0; i < 4; i++) {
        const b = await newUser();
        const c = await challenges.create(a.id, { title: `g${i}`, stakeAmount: 10, expiresAt: new Date(Date.now() + 30 * DAY) });
        await challenges.accept(c.id, b.id);
        await results.declare(c.id, a.id, 'LOSS', T0); // pierde cada partida y lo reconoce
        await results.declare(c.id, b.id, 'WIN', T0);
        scores.push((await cred(a.id)).score);
      }
      for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      expect(scores.at(-1)).toBe(computeScore(4, 1));
      await expectConsistent(a.id);
    });
  });

  // ========================================== neutros: silencio y rectificación
  describe('hechos neutros', () => {
    it('perder por silencio de 24 h es neutro para ambos (no es trampa)', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS));

      expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).winnerId).toBe(a.id);
      expect(await cred(b.id)).toEqual({ clean: 0, lost: 0, defaults: 0, score: 100 });
      expect(await cred(a.id)).toEqual({ clean: 0, lost: 0, defaults: 0, score: 100 });
      expect(await eventsOf(id)).toHaveLength(0);
    });

    it('el silencio no borra una penalización previa ni agrega una nueva', async () => {
      const prior = { cleanClosedCount: 10, disputeLostCount: 1, credibilityScore: 67 };
      const { id, a, b } = await active('COINS', {}, prior);
      await results.declare(id, a.id, 'WIN', T0);
      await clocks.adjudicateSilence(id, at(SILENCE_WINDOW_MS));
      expect(await cred(b.id)).toEqual({ clean: 10, lost: 1, defaults: 0, score: 67 });
    });

    it('una disputa resuelta por rectificación no suma ni resta a nadie', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'WIN', T0); // disputa
      await results.declare(id, b.id, 'LOSS', T0); // B rectifica

      expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).status).toBe('CLOSED');
      expect(await cred(a.id)).toEqual({ clean: 0, lost: 0, defaults: 0, score: 100 });
      expect(await cred(b.id)).toEqual({ clean: 0, lost: 0, defaults: 0, score: 100 });
      expect(await eventsOf(id)).toHaveLength(0);
    });

    it('cancelar o vencer un reto no mueve la credibilidad', async () => {
      const { id, a, b } = await active();
      await clocks.expireChallenge(id, new Date(Date.now() + 40 * DAY));
      expect(await cred(a.id)).toMatchObject({ clean: 0, lost: 0, score: 100 });
      expect(await cred(b.id)).toMatchObject({ clean: 0, lost: 0, score: 100 });
    });
  });

  // ================================================== baja fuerte: Juez
  describe('fallo del Juez', () => {
    it('ambos dijeron "gané yo": baja fuerte quien perdió; el ganador no sube ni baja', async () => {
      const { id, a, b, j } = await judged('WIN', 'WIN');
      // A es el ganador; B, quien mintió, ya tenía 10 acuerdos limpios.
      await prisma.user.update({ where: { id: b.id }, data: { cleanClosedCount: 10, credibilityScore: 100 } });

      await judges.verdict(id, j.id, a.id, at(3_600_000));

      expect(await cred(b.id)).toEqual({ clean: 10, lost: 1, defaults: 0, score: 67 });
      expect(await cred(a.id)).toMatchObject({ clean: 0, lost: 0, score: 100 });
      const evs = await eventsOf(id);
      expect(evs).toHaveLength(1);
      expect(evs[0]).toMatchObject({ userId: b.id, type: 'DISPUTE_LOST' });
      await expectConsistent(a.id, b.id);
    });

    it('la caída es fuerte: de 100 a 67 con 10 acuerdos limpios, y deja de ser verde-pleno', async () => {
      const { id, a, b, j } = await judged('WIN', 'WIN');
      await prisma.user.update({ where: { id: a.id }, data: { cleanClosedCount: 10, credibilityScore: 100 } });
      await judges.verdict(id, j.id, b.id, at(3_600_000)); // pierde A
      const view = await credibility.getCredibility(a.id);
      expect(view).toMatchObject({ score: 67, band: 'YELLOW', disputesLost: 1, provisional: false });
    });

    it('si el juez falla a favor del que dijo "gané" y el otro solo dijo "empate", este último no es sancionado', async () => {
      const { id, a, b, j } = await judged('WIN', 'DRAW');
      await judges.verdict(id, j.id, a.id, at(3_600_000)); // gana A (WIN); B había dicho empate
      expect(await cred(b.id)).toMatchObject({ lost: 0, score: 100 });
      expect(await cred(a.id)).toMatchObject({ lost: 0, score: 100 });
      expect(await eventsOf(id)).toHaveLength(0);
    });

    it('si el juez desmiente a quien declaró "gané" frente a un "empate", sí se sanciona al que declaró victoria', async () => {
      const { id, a, b, j } = await judged('WIN', 'DRAW');
      await judges.verdict(id, j.id, b.id, at(3_600_000)); // gana B; la victoria de A fue desmentida
      expect(await cred(a.id)).toMatchObject({ lost: 1, score: computeScore(0, 1) });
      expect(await cred(b.id)).toMatchObject({ lost: 0, score: 100 });
    });

    it('un fallo que no se puede liquidar no deja asientos de credibilidad (todo o nada)', async () => {
      // Disputa armada sin monedas reservadas: el fallo debe revertirse completo.
      const a = await newUser();
      const b = await newUser();
      const j = await newUser(10);
      const c = await prisma.challenge.create({
        data: {
          inviteCode: randomUUID().slice(0, 10), title: 'sin reserva', creatorId: a.id, opponentId: b.id,
          stakeAmount: 10, status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN',
          judgeId: j.id, judgeProposedById: a.id, judgeAssignedAt: T0, expiresAt: new Date(Date.now() + DAY),
        },
      });
      await expect(judges.verdict(c.id, j.id, a.id, at(3_600_000))).rejects.toThrow();
      expect(await eventsOf(c.id)).toHaveLength(0);
      expect(await cred(b.id)).toEqual({ clean: 0, lost: 0, defaults: 0, score: 100 });
    });
  });

  // ====================================================== modo Plata
  describe('pago incumplido en modo Plata', () => {
    const afterGrace = () => new Date(Date.now() + CASH_PAYMENT_GRACE_MS + 60_000);

    it('el deudor baja fuerte al reclamarse el incumplimiento; el ganador no cambia', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0); // A gana, B debe pagar
      expect(await cred(b.id)).toMatchObject({ clean: 1, defaults: 0, score: 100 });

      await cash.claimDefault(id, a.id, afterGrace());

      expect(await cred(b.id)).toEqual({ clean: 1, lost: 0, defaults: 1, score: computeScore(1, 1) });
      expect(await cred(b.id).then((c) => c.score)).toBe(17);
      expect(await cred(a.id)).toMatchObject({ clean: 1, defaults: 0, score: 100 });
      const evs = await eventsOf(id);
      expect(evs.find((e) => e.type === 'PAYMENT_DEFAULT')).toMatchObject({ userId: b.id });
      await expectConsistent(a.id, b.id);
    });

    it('también si el deudor dijo que pagó (PAID_CLAIMED) pero el ganador no recibió nada', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      await cash.markPaid(id, b.id);
      await cash.claimDefault(id, a.id, afterGrace());
      expect((await cred(b.id)).defaults).toBe(1);
    });

    it('el incumplimiento cuenta una sola vez, aunque se intente reclamar de nuevo o en paralelo', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);

      const r = await Promise.allSettled(Array.from({ length: 6 }, () => cash.claimDefault(id, a.id, afterGrace())));
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      await expect(cash.claimDefault(id, a.id, afterGrace())).rejects.toBeInstanceOf(ConflictException);
      expect((await cred(b.id)).defaults).toBe(1);
      expect(await prisma.credibilityEvent.count({ where: { challengeId: id, type: 'PAYMENT_DEFAULT' } })).toBe(1);
    });

    it('un reclamo rechazado (todavía en plazo) no penaliza a nadie', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      await expect(cash.claimDefault(id, a.id, new Date())).rejects.toBeInstanceOf(ConflictException);
      expect((await cred(b.id)).defaults).toBe(0);
    });

    it('confirmar el pago no penaliza: el acuerdo cumplido deja el puntaje intacto', async () => {
      const { id, a, b } = await active('CASH');
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      await cash.markPaid(id, b.id);
      await cash.confirmReceived(id, a.id);
      expect(await cred(b.id)).toEqual({ clean: 1, lost: 0, defaults: 0, score: 100 });
    });

    it('se acumula con una disputa perdida: un incumplimiento por el fallo y otro por no pagar', async () => {
      const { id, a, b, j } = await judged('WIN', 'WIN', 'CASH');
      const verdictAt = at(3_600_000); // el reto se cierra en este instante simulado
      await judges.verdict(id, j.id, a.id, verdictAt); // B pierde la disputa
      expect((await cred(b.id)).lost).toBe(1);
      await cash.claimDefault(id, a.id, new Date(verdictAt.getTime() + CASH_PAYMENT_GRACE_MS + 60_000));
      expect(await cred(b.id)).toEqual({ clean: 0, lost: 1, defaults: 1, score: computeScore(0, 2) });
      await expectConsistent(b.id);
    });
  });

  // ================================================== servicio y consistencia
  describe('CredibilityService', () => {
    it('un usuario nuevo es verde y provisional', async () => {
      const u = await newUser();
      expect(await credibility.getCredibility(u.id)).toMatchObject({
        score: 100, band: 'GREEN', provisional: true, cleanAgreements: 0, disputesLost: 0, paymentDefaults: 0,
      });
    });

    it('expone totales de jugados y victorias junto al puntaje', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0);
      expect(await credibility.getCredibility(a.id)).toMatchObject({ totalPlayed: 1, totalWins: 1, cleanAgreements: 1 });
      expect(await credibility.getCredibility(b.id)).toMatchObject({ totalPlayed: 1, totalWins: 0, cleanAgreements: 1 });
    });

    it('un usuario inexistente responde 404', async () => {
      await expect(credibility.getCredibility(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('registrar el mismo hecho varias veces (aun en paralelo) cuenta una sola vez', async () => {
      const { id, a } = await active();
      const record = () =>
        prisma.$transaction((tx) => recordCredibilityEvent(tx, { userId: a.id, challengeId: id, type: 'DISPUTE_LOST' }));
      const r = await Promise.all(Array.from({ length: 8 }, record));
      expect(r.filter(Boolean)).toHaveLength(1);
      expect(await cred(a.id)).toMatchObject({ lost: 1, score: 0 });
      expect(await prisma.credibilityEvent.count({ where: { userId: a.id, challengeId: id } })).toBe(1);
    });

    it('recompute reconstruye contadores y puntaje desde los asientos y repara desvíos', async () => {
      const { id, a, b } = await active();
      await results.declare(id, a.id, 'WIN', T0);
      await results.declare(id, b.id, 'LOSS', T0); // 1 acuerdo limpio por jugador

      await prisma.user.update({
        where: { id: a.id },
        data: { cleanClosedCount: 999, disputeLostCount: 7, paymentDefaultCount: 3, credibilityScore: 3 },
      });
      const view = await credibility.recompute(a.id);

      expect(view).toMatchObject({ cleanAgreements: 1, disputesLost: 0, paymentDefaults: 0, score: 100 });
      expect(await cred(a.id)).toEqual({ clean: 1, lost: 0, defaults: 0, score: 100 });
    });

    it('cada usuario cierra con el puntaje coherente con sus contadores tras muchas partidas en paralelo', async () => {
      const games = await Promise.all(Array.from({ length: 6 }, () => active()));
      await Promise.all(
        games.flatMap((g) => [results.declare(g.id, g.a.id, 'WIN', T0), results.declare(g.id, g.b.id, 'LOSS', T0)]),
      );
      for (const g of games) {
        expect(await cred(g.a.id)).toMatchObject({ clean: 1, score: 100 });
        await expectConsistent(g.a.id, g.b.id);
      }
    });

    it('cierres simultáneos de varios retos del mismo jugador no pierden ninguna suma', async () => {
      const a = await newUser(200);
      const games = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const b = await newUser();
          const c = await challenges.create(a.id, { title: 'multi', stakeAmount: 10, expiresAt: new Date(Date.now() + 30 * DAY) });
          await challenges.accept(c.id, b.id);
          return { id: c.id, b };
        }),
      );
      await Promise.all(
        games.flatMap((g) => [results.declare(g.id, a.id, 'WIN', T0), results.declare(g.id, g.b.id, 'LOSS', T0)]),
      );
      expect((await cred(a.id)).clean).toBe(5);
      expect(await prisma.credibilityEvent.count({ where: { userId: a.id } })).toBe(5);
      await expectConsistent(a.id);
    });
  });
});
