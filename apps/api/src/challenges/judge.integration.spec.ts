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
import { JUDGE_REWARD_COINS, JUDGE_WINDOW_MS, WalletService } from '../wallet/wallet.service.js';
import { ChallengesService } from './challenges.service.js';
import { JudgeService } from './judge.service.js';
import { ChallengeResultsService } from './results.service.js';

// Requiere `npm run db:up` (PostgreSQL local).
describe('JudgeService – proponer, aprobar y dar el fallo (integración)', () => {
  const prisma = new PrismaService();
  const wallet = new WalletService(prisma);
  const friends = new FriendsService(prisma);
  const challenges = new ChallengesService(prisma, wallet, friends);
  const results = new ChallengeResultsService(prisma, wallet, new StreakService(prisma));
  const judges = new JudgeService(prisma, wallet, friends, results);
  const userIds: string[] = [];
  const DAY = 86_400_000;
  const T0 = new Date();
  const at = (ms: number) => new Date(T0.getTime() + ms);
  const hours = (n: number) => n * 3_600_000;

  async function newUser(coins = 100) {
    const u = await prisma.user.create({
      data: { displayName: 'J', username: `j_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    await prisma.walletTransaction.create({
      data: { userId: u.id, currency: 'COINS', type: 'BONUS_INIT', amount: coins, idempotencyKey: `bonus_init:${u.id}` },
    });
    userIds.push(u.id);
    return u;
  }

  /** Reto en DISPUTA (ambos dijeron "gané yo") con un candidato a Juez amigo de A. */
  async function dispute(mode: 'COINS' | 'CASH' = 'COINS') {
    const a = await newUser();
    const b = await newUser();
    const j = await newUser(10);
    await friends.connectFriends(a.id, j.id);
    const created = await challenges.create(a.id, {
      title: 'Partida de FIFA',
      stakeAmount: mode === 'CASH' ? 5000 : 10,
      mode,
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    await challenges.accept(created.id, b.id);
    await results.declare(created.id, a.id, 'WIN', T0);
    await results.declare(created.id, b.id, 'WIN', T0);
    return { id: created.id, a, b, j };
  }
  /** Disputa con el Juez ya propuesto por A y aprobado por B en `assignedAt`. */
  async function assigned(mode: 'COINS' | 'CASH' = 'COINS', assignedAt = T0) {
    const d = await dispute(mode);
    await judges.propose(d.id, d.a.id, d.j.id);
    await judges.approve(d.id, d.b.id, assignedAt);
    return d;
  }

  const bal = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { available: u.coinsAvailable, reserved: u.coinsReserved };
  };
  const row = (id: string) => prisma.challenge.findUniqueOrThrow({ where: { id } });
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

  // =============================================================== proponer
  describe('proponer', () => {
    it('el creador propone a un amigo: queda pendiente de la aprobación del rival', async () => {
      const { id, a, j } = await dispute();
      const res = await judges.propose(id, a.id, j.id);

      expect(res).toMatchObject({ judgeId: j.id, proposedById: a.id, assigned: false, verdictDeadline: null });
      expect(await row(id)).toMatchObject({
        judgeId: j.id, judgeProposedById: a.id,
        judgeApprovedByCreator: true, judgeApprovedByOpponent: false, judgeAssignedAt: null,
      });
      expect(await events(id)).toContain('JUDGE_PROPOSED');
    });

    it('si propone el rival, la aprobación que falta es la del creador', async () => {
      const { id, a, b } = await dispute();
      const other = await newUser();
      await friends.connectFriends(b.id, other.id);
      await judges.propose(id, b.id, other.id);
      expect(await row(id)).toMatchObject({ judgeApprovedByCreator: false, judgeApprovedByOpponent: true });
      void a;
    });

    it('una contrapropuesta reemplaza a la pendiente y reinicia las aprobaciones', async () => {
      const { id, a, b, j } = await dispute();
      const j2 = await newUser();
      await friends.connectFriends(b.id, j2.id);
      await judges.propose(id, a.id, j.id);
      const res = await judges.propose(id, b.id, j2.id);

      expect(res).toMatchObject({ judgeId: j2.id, proposedById: b.id, assigned: false });
      expect(await row(id)).toMatchObject({ judgeApprovedByCreator: false, judgeApprovedByOpponent: true });
      // Ahora quien debe aprobar es A, no B.
      await expect(judges.approve(id, b.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(judges.approve(id, a.id)).resolves.toMatchObject({ assigned: true, judgeId: j2.id });
    });

    it('solo se propone en una disputa', async () => {
      const a = await newUser();
      const b = await newUser();
      const j = await newUser();
      await friends.connectFriends(a.id, j.id);
      const c = await challenges.create(a.id, { title: 'x', stakeAmount: 10, expiresAt: new Date(Date.now() + DAY) });
      await challenges.accept(c.id, b.id); // ACTIVO
      let err: any = await judges.propose(c.id, a.id, j.id).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'NOT_IN_DISPUTE', status: 'ACTIVE' });

      await results.declare(c.id, a.id, 'WIN', T0); // RESULTADO
      err = await judges.propose(c.id, a.id, j.id).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'NOT_IN_DISPUTE', status: 'RESULT' });
    });

    it('valida quién y a quién se propone', async () => {
      const { id, a, b, j } = await dispute();
      const stranger = await newUser();
      await expect(judges.propose(id, stranger.id, j.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(judges.propose(id, a.id, b.id)).rejects.toBeInstanceOf(BadRequestException); // el rival no puede ser Juez
      await expect(judges.propose(id, a.id, a.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(judges.propose(id, a.id, undefined as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(judges.propose(id, a.id, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
      const notFriend = await newUser();
      await expect(judges.propose(id, a.id, notFriend.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(id)).judgeId).toBeNull();
    });

    it('no se puede cambiar al Juez una vez asignado', async () => {
      const { id, a } = await assigned();
      const other = await newUser();
      await friends.connectFriends(a.id, other.id);
      const err: any = await judges.propose(id, a.id, other.id).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'JUDGE_ALREADY_ASSIGNED' });
    });
  });

  // =============================================================== aprobar
  describe('aprobar', () => {
    it('el rival aprueba: el Juez queda asignado y corren sus 48 horas', async () => {
      const { id, a, b, j } = await dispute();
      await judges.propose(id, a.id, j.id);
      const res = await judges.approve(id, b.id, T0);

      expect(res).toMatchObject({ judgeId: j.id, assigned: true });
      expect(res.verdictDeadline?.getTime()).toBe(T0.getTime() + JUDGE_WINDOW_MS);
      expect(await row(id)).toMatchObject({ judgeApprovedByCreator: true, judgeApprovedByOpponent: true });
      expect((await row(id)).judgeAssignedAt?.getTime()).toBe(T0.getTime());
      expect(await events(id)).toContain('JUDGE_ASSIGNED');
    });

    it('quien propuso no puede aprobar a su propio Juez', async () => {
      const { id, a, j } = await dispute();
      await judges.propose(id, a.id, j.id);
      await expect(judges.approve(id, a.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(id)).judgeAssignedAt).toBeNull();
    });

    it('un tercero no aprueba, ni se aprueba sin propuesta, ni dos veces', async () => {
      const { id, a, b, j } = await dispute();
      const stranger = await newUser();
      const none: any = await judges.approve(id, b.id).catch((e) => e);
      expect(none).toBeInstanceOf(ConflictException);
      expect(none.getResponse()).toMatchObject({ code: 'NO_PENDING_PROPOSAL' });

      await judges.propose(id, a.id, j.id);
      await expect(judges.approve(id, stranger.id)).rejects.toBeInstanceOf(ForbiddenException);
      await judges.approve(id, b.id, T0);
      const twice: any = await judges.approve(id, b.id).catch((e) => e);
      expect(twice.getResponse()).toMatchObject({ code: 'NO_PENDING_PROPOSAL' });
    });

    it('aprobaciones simultáneas: queda asignado una sola vez', async () => {
      const { id, a, b, j } = await dispute();
      await judges.propose(id, a.id, j.id);
      const r = await Promise.allSettled(Array.from({ length: 6 }, () => judges.approve(id, b.id, T0)));
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect((await events(id)).filter((e) => e === 'JUDGE_ASSIGNED')).toHaveLength(1);
    });
  });

  // =============================================================== fallo
  describe('fallo del Juez', () => {
    it('cierra a favor de A: A cobra el pozo y el Juez recibe +5, todo consistente', async () => {
      const { id, a, b, j } = await assigned();
      const res = await judges.verdict(id, j.id, a.id, at(hours(10)));

      expect(res).toEqual({ challengeId: id, status: 'CLOSED', winnerId: a.id, judgeRewarded: true });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      expect(await bal(j.id)).toEqual({ available: 10 + JUDGE_REWARD_COINS, reserved: 0 });
      await expectLedger(a.id, b.id, j.id);

      const c = await row(id);
      expect(c).toMatchObject({ status: 'CLOSED', winnerId: a.id });
      expect(c.closedAt?.getTime()).toBe(at(hours(10)).getTime());

      const evs = await events(id);
      // Los eventos de una misma transacción pueden compartir milisegundo: no se asume su orden.
      expect([...evs].sort()).toEqual(
        [
          'CHALLENGE_ACCEPTED', 'CHALLENGE_CLOSED', 'CHALLENGE_CREATED', 'COINS_RESERVED', 'COINS_SETTLED',
          'DISPUTE_OPENED', 'JUDGE_ASSIGNED', 'JUDGE_PROPOSED', 'JUDGE_VERDICT', 'RESULT_DECLARED', 'RESULT_DECLARED',
        ].sort(),
      );
      const closed = await prisma.challengeEvent.findFirstOrThrow({ where: { challengeId: id, eventType: 'CHALLENGE_CLOSED' } });
      expect(closed.payload).toMatchObject({
        outcome: 'WIN', winnerId: a.id, loserId: b.id, resolvedBy: 'JUDGE', judgeId: j.id, hadDispute: true,
        creatorVote: 'WIN', opponentVote: 'WIN',
      });
      const reward = await prisma.walletTransaction.findUniqueOrThrow({
        where: { idempotencyKey: `judge_reward:${id}:${j.id}` },
      });
      expect(reward).toMatchObject({ userId: j.id, type: 'JUDGE', amount: 5 });
    });

    it('también puede fallar a favor del rival (B)', async () => {
      const { id, a, b, j } = await assigned();
      await judges.verdict(id, j.id, b.id, at(hours(1)));
      expect(await bal(b.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(a.id)).toEqual({ available: 90, reserved: 0 });
      expect((await row(id)).winnerId).toBe(b.id);
    });

    it('actualiza estadísticas, y una disputa fallada por Juez no suma constancia', async () => {
      const { id, a, b, j } = await assigned();
      await judges.verdict(id, j.id, a.id, at(hours(2)));
      const ua = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
      const ub = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
      expect(ua).toMatchObject({ totalPlayed: 1, totalWins: 1, streakDaysCount: 0, lastCleanChallengeAt: null });
      expect(ub).toMatchObject({ totalPlayed: 1, totalWins: 0, streakDaysCount: 0 });
    });

    it('en modo Plata deja el pago PENDIENTE, no mueve monedas de los jugadores y el Juez igual cobra +5', async () => {
      const { id, a, b, j } = await assigned('CASH');
      await judges.verdict(id, j.id, a.id, at(hours(3)));
      expect(await row(id)).toMatchObject({ status: 'CLOSED', winnerId: a.id, cashPaymentStatus: 'PENDING' });
      expect(await bal(a.id)).toEqual({ available: 100, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 100, reserved: 0 });
      expect((await bal(j.id)).available).toBe(15);
    });

    it('el borde de las 48 h: exactamente 48:00 vale, un milisegundo después no', async () => {
      const ok = await assigned();
      await expect(judges.verdict(ok.id, ok.j.id, ok.a.id, at(JUDGE_WINDOW_MS))).resolves.toMatchObject({ judgeRewarded: true });

      const late = await assigned();
      const err: any = await judges.verdict(late.id, late.j.id, late.a.id, at(JUDGE_WINDOW_MS + 1)).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'JUDGE_WINDOW_EXPIRED' });
      // Nada cambió: sigue en disputa, monedas reservadas y sin recompensa.
      expect((await row(late.id)).status).toBe('DISPUTE');
      expect(await bal(late.a.id)).toEqual({ available: 90, reserved: 10 });
      expect((await bal(late.j.id)).available).toBe(10);
      expect(await events(late.id)).not.toContain('JUDGE_VERDICT');
    });

    it('solo el Juez asignado puede fallar (no el candidato sin aprobar, ni jugadores, ni terceros)', async () => {
      const pending = await dispute();
      await judges.propose(pending.id, pending.a.id, pending.j.id); // propuesto, sin aprobación
      await expect(judges.verdict(pending.id, pending.j.id, pending.a.id, T0)).rejects.toBeInstanceOf(ForbiddenException);

      const { id, a, b } = await assigned();
      const stranger = await newUser();
      await expect(judges.verdict(id, stranger.id, a.id, T0)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(judges.verdict(id, a.id, a.id, T0)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(judges.verdict(id, b.id, b.id, T0)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await row(id)).status).toBe('DISPUTE');
    });

    it('el ganador debe ser uno de los jugadores y no deja nada a medias', async () => {
      const { id, j } = await assigned();
      const stranger = await newUser();
      await expect(judges.verdict(id, j.id, stranger.id, T0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(judges.verdict(id, j.id, undefined as any, T0)).rejects.toBeInstanceOf(BadRequestException);
      expect((await row(id)).status).toBe('DISPUTE');
      expect(await events(id)).not.toContain('JUDGE_VERDICT');
    });

    it('un reto ya cerrado no admite otro fallo', async () => {
      const { id, a, j } = await assigned();
      await judges.verdict(id, j.id, a.id, at(hours(1)));
      const err: any = await judges.verdict(id, j.id, a.id, at(hours(2))).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'NOT_IN_DISPUTE', status: 'CLOSED' });
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
    });

    it('5 fallos simultáneos: se paga el pozo una vez y la recompensa una vez', async () => {
      const { id, a, b, j } = await assigned();
      const r = await Promise.allSettled(Array.from({ length: 5 }, () => judges.verdict(id, j.id, a.id, at(hours(1)))));
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      expect(await bal(j.id)).toEqual({ available: 15, reserved: 0 });
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      await expectLedger(a.id, b.id, j.id);
    });

    it('si los jugadores se ponen de acuerdo antes del fallo, la disputa se cierra y el Juez ya no cobra', async () => {
      const { id, a, b, j } = await assigned();
      await results.declare(id, b.id, 'LOSS', at(hours(5))); // B reconoce que ganó A
      expect((await row(id)).status).toBe('CLOSED');
      const err: any = await judges.verdict(id, j.id, a.id, at(hours(6))).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'NOT_IN_DISPUTE' });
      expect((await bal(j.id)).available).toBe(10); // sin recompensa
    });

    it('fallo y rectificación a la vez: queda un solo cierre y un solo pago', async () => {
      const { id, a, b, j } = await assigned();
      await Promise.allSettled([
        judges.verdict(id, j.id, a.id, at(hours(1))),
        results.declare(id, b.id, 'LOSS', at(hours(1))),
      ]);
      expect((await row(id)).status).toBe('CLOSED');
      expect((await events(id)).filter((e) => e === 'CHALLENGE_CLOSED')).toHaveLength(1);
      expect(await bal(a.id)).toEqual({ available: 110, reserved: 0 });
      expect(await bal(b.id)).toEqual({ available: 90, reserved: 0 });
      await expectLedger(a.id, b.id, j.id);
    });

    it('un mismo Juez resolviendo varias disputas a la vez no se bloquea (sin deadlock) y cobra todas', async () => {
      const j = await newUser(10);
      const games = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const a = await newUser();
          const b = await newUser();
          await friends.connectFriends(a.id, j.id);
          const created = await challenges.create(a.id, {
            title: 'Disputa', stakeAmount: 10, expiresAt: new Date(Date.now() + 30 * DAY),
          });
          await challenges.accept(created.id, b.id);
          await results.declare(created.id, a.id, 'WIN', T0);
          await results.declare(created.id, b.id, 'WIN', T0);
          await judges.propose(created.id, a.id, j.id);
          await judges.approve(created.id, b.id, T0);
          return { id: created.id, a, b };
        }),
      );

      const r = await Promise.allSettled(games.map((g) => judges.verdict(g.id, j.id, g.a.id, at(hours(1)))));
      expect(r.filter((x) => x.status === 'rejected')).toEqual([]);
      for (const g of games) {
        expect((await row(g.id)).status).toBe('CLOSED');
        expect(await bal(g.a.id)).toEqual({ available: 110, reserved: 0 });
        expect(await bal(g.b.id)).toEqual({ available: 90, reserved: 0 });
      }
      expect((await bal(j.id)).available).toBe(10 + 5 * JUDGE_REWARD_COINS);
      await expectLedger(j.id);
    });

    it('si la liquidación falla, el fallo y la recompensa se revierten por completo', async () => {
      // Disputa armada a mano SIN monedas reservadas: liquidar debe fallar.
      const a = await newUser();
      const b = await newUser();
      const j = await newUser(10);
      const c = await prisma.challenge.create({
        data: {
          inviteCode: randomUUID().slice(0, 10), title: 'sin reserva', creatorId: a.id, opponentId: b.id,
          stakeAmount: 10, status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN',
          judgeId: j.id, judgeProposedById: a.id, judgeAssignedAt: T0,
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      await expect(judges.verdict(c.id, j.id, a.id, at(hours(1)))).rejects.toBeInstanceOf(BadRequestException);

      expect(await row(c.id)).toMatchObject({ status: 'DISPUTE', winnerId: null });
      expect(await events(c.id)).toEqual([]); // ni JUDGE_VERDICT ni cierre
      expect((await bal(j.id)).available).toBe(10);
      expect(await prisma.walletTransaction.count({ where: { userId: j.id, type: 'JUDGE' } })).toBe(0);
    });
  });

  // ============================================================== consulta
  describe('estado de la designación', () => {
    it('lo ven los jugadores y el Juez; un tercero no', async () => {
      const { id, a, b, j } = await assigned();
      for (const viewer of [a.id, b.id, j.id]) {
        expect(await judges.getStatus(id, viewer)).toMatchObject({ judgeId: j.id, assigned: true });
      }
      const stranger = await newUser();
      await expect(judges.getStatus(id, stranger.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(judges.getStatus(randomUUID(), a.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
