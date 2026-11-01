process.env.CLOCKS_ENABLED = 'false'; // sin worker: los relojes se simulan en las pruebas
process.env.CLOCK_QUEUE_NAME = `test-http-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ChallengeClocksService } from '../src/challenges/clocks.service.js';
import { CLOCK_SCHEDULER } from '../src/clocks/clock-scheduler.js';
import type { BullClockScheduler } from '../src/clocks/clock-scheduler.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SILENCE_WINDOW_MS } from '../src/challenges/results.service.js';

type U = { id: string; token: string; username: string };
type Vote = 'WIN' | 'LOSS' | 'DRAW';

const FORBIDDEN = ['level', 'nivel', 'streak', 'racha', 'multiplier', 'multiplicador', 'xp', 'coins', 'phone', 'whatsapp'];

/** Todas las claves de un objeto JSON, a cualquier profundidad. */
function allKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, acc));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.push(k);
      allKeys(v, acc);
    }
  }
  return acc;
}
function expectNoForbiddenKeys(body: unknown) {
  const keys = allKeys(body).map((k) => k.toLowerCase());
  for (const f of FORBIDDEN) expect(keys.filter((k) => k.includes(f))).toEqual([]);
}

// Requiere `npm run db:up`. Se corre con `npm run test:e2e` (servidor HTTP real en memoria).
describe('API – perfil e historial competitivo (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  async function register(label: string): Promise<U> {
    const username = `e2e_${label}_${randomUUID().slice(0, 6)}`.toLowerCase();
    const res = await api().post('/auth/instant-register').send({ displayName: label, username }).expect(201);
    userIds.push(res.body.user.id);
    return { id: res.body.user.id, token: res.body.accessToken, username };
  }

  /** Reto completo por HTTP: crear, aceptar, y ambos declaran. Devuelve el id del reto. */
  async function play(
    creator: U,
    opponent: U,
    votes: [Vote, Vote],
    opts: { mode?: 'COINS' | 'CASH'; stake?: number; title?: string } = {},
  ): Promise<string> {
    const mode = opts.mode ?? 'COINS';
    const created = await api()
      .post('/challenges')
      .set(auth(creator))
      .send({
        title: opts.title ?? 'Emboque de papel',
        mode,
        stakeAmount: opts.stake ?? (mode === 'CASH' ? 5000 : 10),
        expiresAt: inDays(30),
      })
      .expect(201);
    const id: string = created.body.id;
    await api().post(`/challenges/${id}/accept`).set(auth(opponent)).expect(200);
    await api().post(`/challenges/${id}/declare`).set(auth(creator)).send({ vote: votes[0] }).expect(200);
    await api().post(`/challenges/${id}/declare`).set(auth(opponent)).send({ vote: votes[1] }).expect(200);
    return id;
  }

  /** Hace amigos a dos usuarios: uno acepta un reto del otro (queda cerrado en empate). */
  async function befriend(a: U, b: U) {
    await play(a, b, ['DRAW', 'DRAW'], { title: 'Para hacernos amigos' });
  }

  const profile = (viewer: U, id: string) => api().get(`/users/${id}/profile`).set(auth(viewer));
  const history = (viewer: U, query = '') => api().get(`/challenges/history${query}`).set(auth(viewer));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
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
    const scheduler = app.get<BullClockScheduler>(CLOCK_SCHEDULER);
    await scheduler.queue.obliterate({ force: true });
    await app.close();
  });

  // ============================================================== PERFIL
  describe('GET /users/:id/profile', () => {
    it('exige sesión', async () => {
      await api().get(`/users/${randomUUID()}/profile`).expect(401);
      await api().get('/users/me/profile').expect(401);
    });

    it('un usuario nuevo ve su perfil (por "me" y por su id): 0 jugados, Fair Play 100 verde y provisional', async () => {
      const ana = await register('ana');
      for (const id of ['me', ana.id]) {
        const res = await profile(ana, id).expect(200);
        expect(res.body).toMatchObject({
          id: ana.id, username: ana.username, displayName: 'ana', isSelf: true,
          totalPlayed: 0, totalWins: 0,
          credibility: { score: 100, band: 'GREEN', provisional: true },
        });
        expect(new Date(res.body.memberSince).getTime()).toBeLessThanOrEqual(Date.now());
      }
    });

    it('devuelve únicamente jugados, victorias y % Fair Play: sin niveles, rachas ni datos internos', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS']);

      const res = await profile(ana, 'me').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['credibility', 'displayName', 'id', 'isSelf', 'memberSince', 'totalPlayed', 'totalWins', 'username'].sort(),
      );
      expect(Object.keys(res.body.credibility).sort()).toEqual(['band', 'provisional', 'score']);
      expectNoForbiddenKeys(res.body);
      // Tampoco el desglose interno de disputas o pagos.
      const keys = allKeys(res.body).map((k) => k.toLowerCase());
      for (const hidden of ['disputeslost', 'paymentdefaults', 'cleanagreements', 'disputelostcount']) {
        expect(keys).not.toContain(hidden);
      }
    });

    it('refleja las victorias y los jugados reales, y un amigo ve exactamente lo mismo', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS']); // gana Ana
      await play(ana, beto, ['WIN', 'LOSS']); // gana Ana
      await play(ana, beto, ['LOSS', 'WIN']); // gana Beto
      await play(ana, beto, ['DRAW', 'DRAW']); // empate

      const own = await profile(ana, 'me').expect(200);
      expect(own.body).toMatchObject({ totalPlayed: 4, totalWins: 2, credibility: { score: 100, band: 'GREEN', provisional: false } });

      const seenByFriend = await profile(beto, ana.id).expect(200);
      expect(seenByFriend.body).toMatchObject({ id: ana.id, isSelf: false, totalPlayed: 4, totalWins: 2 });
      expect(seenByFriend.body.credibility).toEqual(own.body.credibility);

      const beto1 = await profile(beto, 'me').expect(200);
      expect(beto1.body).toMatchObject({ totalPlayed: 4, totalWins: 1 }); // perder no resta nada
      expect(beto1.body.credibility).toMatchObject({ score: 100, band: 'GREEN' });
    });

    it('el % Fair Play baja fuerte tras perder una disputa ante el Juez, y lo ve el rival', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const juez = await register('juez');
      await play(ana, beto, ['WIN', 'LOSS']); // 1 acuerdo limpio para cada uno
      await befriend(ana, juez);

      // Disputa: ambos dicen "gané yo"; el Juez le da la razón a Ana.
      const created = await api().post('/challenges').set(auth(ana)).send({ title: 'Disputa', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      const id = created.body.id;
      await api().post(`/challenges/${id}/accept`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${id}/declare`).set(auth(ana)).send({ vote: 'WIN' }).expect(200);
      await api().post(`/challenges/${id}/declare`).set(auth(beto)).send({ vote: 'WIN' }).expect(200);
      await api().post(`/challenges/${id}/judge/propose`).set(auth(ana)).send({ judgeId: juez.id }).expect(200);
      await api().post(`/challenges/${id}/judge/approve`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${id}/judge/verdict`).set(auth(juez)).send({ winnerId: ana.id }).expect(200);

      const losing = await profile(ana, beto.id).expect(200); // Ana mira a Beto
      // 1 acuerdo limpio y 1 incumplimiento: 1/(1+5) = 17. Con solo 2 hechos sigue siendo provisional.
      expect(losing.body.credibility).toMatchObject({ score: 17, band: 'RED', provisional: true });
      expect(losing.body).toMatchObject({ totalPlayed: 2, totalWins: 0 });
      const winner = await profile(beto, ana.id).expect(200); // Beto mira a Ana
      expect(winner.body.credibility).toMatchObject({ score: 100, band: 'GREEN' });
    });

    it('el silencio de 24 h no deja marca en el Fair Play del que perdió', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const created = await api().post('/challenges').set(auth(ana)).send({ title: 'Silencio', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      const id = created.body.id;
      await api().post(`/challenges/${id}/accept`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${id}/declare`).set(auth(ana)).send({ vote: 'WIN' }).expect(200);
      await app.get(ChallengeClocksService).adjudicateSilence(id, new Date(Date.now() + SILENCE_WINDOW_MS + 1000));

      const res = await profile(ana, beto.id).expect(200);
      expect(res.body).toMatchObject({ totalPlayed: 1, totalWins: 0, credibility: { score: 100, band: 'GREEN' } });
    });

    describe('quién puede ver un perfil', () => {
      it('un desconocido (sin amistad ni retos en común) recibe 403', async () => {
        const ana = await register('ana');
        const extrano = await register('extrano');
        await profile(extrano, ana.id).expect(403);
      });

      it('un usuario inexistente o un id raro responde 404', async () => {
        const ana = await register('ana');
        await profile(ana, randomUUID()).expect(404);
        await profile(ana, 'no-existe').expect(404);
      });

      it('el rival de un reto pendiente (todavía no son amigos) sí puede verlo', async () => {
        const ana = await register('ana');
        const beto = await register('beto');
        const created = await api().post('/challenges').set(auth(ana)).send({ title: 'Pendiente', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
        await profile(beto, ana.id).expect(403); // antes de participar, no
        await api().post(`/challenges/${created.body.id}/accept`).set(auth(beto)).expect(200);
        await profile(beto, ana.id).expect(200); // ahora comparten un reto (y son amigos)
      });

      it('el Juez asignado puede ver a los dos jugadores aunque no sea amigo de uno de ellos', async () => {
        const ana = await register('ana');
        const beto = await register('beto');
        const juez = await register('juez');
        await befriend(ana, juez); // el Juez solo es amigo de Ana
        await profile(juez, beto.id).expect(403);

        const created = await api().post('/challenges').set(auth(ana)).send({ title: 'x', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
        const id = created.body.id;
        await api().post(`/challenges/${id}/accept`).set(auth(beto)).expect(200);
        await api().post(`/challenges/${id}/declare`).set(auth(ana)).send({ vote: 'WIN' }).expect(200);
        await api().post(`/challenges/${id}/declare`).set(auth(beto)).send({ vote: 'WIN' }).expect(200);
        await api().post(`/challenges/${id}/judge/propose`).set(auth(ana)).send({ judgeId: juez.id }).expect(200);
        await api().post(`/challenges/${id}/judge/approve`).set(auth(beto)).expect(200);

        await profile(juez, beto.id).expect(200);
        await profile(juez, ana.id).expect(200);
      });
    });
  });

  // ============================================================ HISTORIAL
  describe('GET /challenges/history', () => {
    it('exige sesión', async () => {
      await api().get('/challenges/history').expect(401);
    });

    it('sin retos cerrados devuelve la lista vacía y el balance en cero', async () => {
      const ana = await register('ana');
      const res = await history(ana).expect(200);
      expect(res.body).toEqual({ items: [], summary: { total: 0, wins: 0, losses: 0, draws: 0 }, nextCursor: null });
    });

    it('lista los retos cerrados del más reciente al más antiguo, con rival, resultado y balance', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const r1 = await play(ana, beto, ['WIN', 'LOSS'], { title: 'Primero' });
      const r2 = await play(ana, beto, ['LOSS', 'WIN'], { title: 'Segundo' });
      const r3 = await play(ana, beto, ['DRAW', 'DRAW'], { title: 'Tercero' });

      const res = await history(ana).expect(200);
      expect(res.body.items.map((i: any) => i.id)).toEqual([r3, r2, r1]); // cronológico inverso
      expect(res.body.items.map((i: any) => i.outcome)).toEqual(['DRAW', 'LOST', 'WON']);
      expect(res.body.items[0]).toMatchObject({
        title: 'Tercero', mode: 'COINS', stakeAmount: 10, winnerId: null,
        rival: { id: beto.id, username: beto.username, displayName: 'beto' },
        resolvedBy: 'AGREEMENT', hadDispute: false, cashPaymentStatus: null,
      });
      expect(res.body.items[2].winnerId).toBe(ana.id);
      expect(res.body.summary).toEqual({ total: 3, wins: 1, losses: 1, draws: 1 });
      const dates = res.body.items.map((i: any) => new Date(i.closedAt).getTime());
      expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    });

    it('desde el lado del rival el resultado se espeja (ganó ↔ perdió) con el mismo balance', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS']);
      await play(ana, beto, ['WIN', 'LOSS']);
      await play(ana, beto, ['LOSS', 'WIN']);

      const a = (await history(ana).expect(200)).body;
      const b = (await history(beto).expect(200)).body;
      expect(a.summary).toEqual({ total: 3, wins: 2, losses: 1, draws: 0 });
      expect(b.summary).toEqual({ total: 3, wins: 1, losses: 2, draws: 0 });
      expect(a.items.map((i: any) => i.id)).toEqual(b.items.map((i: any) => i.id));
      const flip = { WON: 'LOST', LOST: 'WON', DRAW: 'DRAW' } as const;
      expect(b.items.map((i: any) => i.outcome)).toEqual(a.items.map((i: any) => flip[i.outcome as keyof typeof flip]));
      expect(b.items[0].rival.id).toBe(ana.id);
    });

    it('solo incluye retos CERRADOS: no los pendientes, activos, en disputa ni cancelados', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const closed = await play(ana, beto, ['WIN', 'LOSS']);
      await api().post('/challenges').set(auth(ana)).send({ title: 'pendiente', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      const cancelled = await api().post('/challenges').set(auth(ana)).send({ title: 'cancelado', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      await api().post(`/challenges/${cancelled.body.id}/cancel`).set(auth(ana)).expect(200);
      const active = await api().post('/challenges').set(auth(ana)).send({ title: 'activo', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      await api().post(`/challenges/${active.body.id}/accept`).set(auth(beto)).expect(200);
      await play(ana, beto, ['WIN', 'WIN']); // queda en disputa

      const res = await history(ana).expect(200);
      expect(res.body.items.map((i: any) => i.id)).toEqual([closed, ...res.body.items.slice(1).map((i: any) => i.id)].slice(0, 1));
      expect(res.body.summary.total).toBe(1);
    });

    it('no filtra retos ajenos: cada uno ve solo los suyos', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const carla = await register('carla');
      await play(ana, beto, ['WIN', 'LOSS']);
      const res = await history(carla).expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.summary.total).toBe(0);
    });

    it('el balance coincide con las victorias y jugados del perfil', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS']);
      await play(ana, beto, ['LOSS', 'WIN']);
      await play(ana, beto, ['DRAW', 'DRAW']);
      await play(ana, beto, ['WIN', 'LOSS']);

      const h = (await history(ana).expect(200)).body;
      const p = (await profile(ana, 'me').expect(200)).body;
      expect(h.summary.total).toBe(p.totalPlayed);
      expect(h.summary.wins).toBe(p.totalWins);
    });

    it('el historial con un amigo (`with`) muestra solo esos retos y el balance entre ambos', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const carla = await register('carla');
      await play(ana, beto, ['WIN', 'LOSS'], { title: 'vs Beto 1' });
      await play(ana, beto, ['LOSS', 'WIN'], { title: 'vs Beto 2' });
      await play(ana, beto, ['WIN', 'LOSS'], { title: 'vs Beto 3' });
      await play(ana, carla, ['WIN', 'LOSS'], { title: 'vs Carla' });

      const all = (await history(ana).expect(200)).body;
      expect(all.summary).toEqual({ total: 4, wins: 3, losses: 1, draws: 0 });

      const vsBeto = (await history(ana, `?with=${beto.id}`).expect(200)).body;
      expect(vsBeto.items.map((i: any) => i.title)).toEqual(['vs Beto 3', 'vs Beto 2', 'vs Beto 1']);
      expect(vsBeto.items.every((i: any) => i.rival.id === beto.id)).toBe(true);
      expect(vsBeto.summary).toEqual({ total: 3, wins: 2, losses: 1, draws: 0 });

      const vsCarla = (await history(ana, `?with=${carla.id}`).expect(200)).body;
      expect(vsCarla.items.map((i: any) => i.title)).toEqual(['vs Carla']);
      expect(vsCarla.summary).toEqual({ total: 1, wins: 1, losses: 0, draws: 0 });
    });

    it('`with` contra uno mismo es inválido y contra alguien sin retos da vacío', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await history(ana, `?with=${ana.id}`).expect(400);
      const res = await history(ana, `?with=${beto.id}`).expect(200);
      expect(res.body).toEqual({ items: [], summary: { total: 0, wins: 0, losses: 0, draws: 0 }, nextCursor: null });
    });

    it('indica cómo se resolvió cada reto: acuerdo, Juez o silencio', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const juez = await register('juez');
      await befriend(ana, juez);

      const agreement = await play(ana, beto, ['WIN', 'LOSS'], { title: 'acuerdo' });

      // Por Juez.
      const j = await api().post('/challenges').set(auth(ana)).send({ title: 'juez', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      await api().post(`/challenges/${j.body.id}/accept`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${j.body.id}/declare`).set(auth(ana)).send({ vote: 'WIN' }).expect(200);
      await api().post(`/challenges/${j.body.id}/declare`).set(auth(beto)).send({ vote: 'WIN' }).expect(200);
      await api().post(`/challenges/${j.body.id}/judge/propose`).set(auth(ana)).send({ judgeId: juez.id }).expect(200);
      await api().post(`/challenges/${j.body.id}/judge/approve`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${j.body.id}/judge/verdict`).set(auth(juez)).send({ winnerId: beto.id }).expect(200);

      // Por silencio.
      const s = await api().post('/challenges').set(auth(ana)).send({ title: 'silencio', stakeAmount: 10, expiresAt: inDays(30) }).expect(201);
      await api().post(`/challenges/${s.body.id}/accept`).set(auth(beto)).expect(200);
      await api().post(`/challenges/${s.body.id}/declare`).set(auth(ana)).send({ vote: 'WIN' }).expect(200);
      await app.get(ChallengeClocksService).adjudicateSilence(s.body.id, new Date(Date.now() + SILENCE_WINDOW_MS + 1000));

      const items = (await history(ana).expect(200)).body.items as any[];
      const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
      expect(byTitle['acuerdo']).toMatchObject({ resolvedBy: 'AGREEMENT', hadDispute: false, outcome: 'WON' });
      expect(byTitle['juez']).toMatchObject({ resolvedBy: 'JUDGE', hadDispute: true, outcome: 'LOST', winnerId: beto.id });
      expect(byTitle['silencio']).toMatchObject({ resolvedBy: 'TIMEOUT', hadDispute: false, outcome: 'WON' });
      expect(agreement).toBeTruthy();
    });

    it('los retos por Plata muestran el estado del pago; los de monedas no', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS'], { mode: 'CASH', stake: 5000, title: 'plata' });
      await play(ana, beto, ['WIN', 'LOSS'], { title: 'monedas' });
      const items = (await history(ana).expect(200)).body.items as any[];
      const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
      expect(byTitle['plata']).toMatchObject({ mode: 'CASH', stakeAmount: 5000, cashPaymentStatus: 'PENDING' });
      expect(byTitle['monedas']).toMatchObject({ mode: 'COINS', cashPaymentStatus: null });
    });

    it('no expone niveles ni rachas en ninguna parte de la respuesta', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      await play(ana, beto, ['WIN', 'LOSS']);
      const res = await history(ana).expect(200);
      expectNoForbiddenKeys(res.body);
      expect(Object.keys(res.body.summary).sort()).toEqual(['draws', 'losses', 'total', 'wins']);
    });

    describe('paginación', () => {
      async function fiveGames() {
        const ana = await register('ana');
        const beto = await register('beto');
        const ids: string[] = [];
        for (let i = 1; i <= 5; i++) ids.push(await play(ana, beto, ['WIN', 'LOSS'], { title: `juego ${i}` }));
        return { ana, beto, ids };
      }
      async function walk(viewer: U, limit: number) {
        const seen: string[] = [];
        const pages: number[] = [];
        let cursor: string | null = null;
        for (let guard = 0; guard < 20; guard++) {
          const q: string = `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
          const res = await history(viewer, q).expect(200);
          pages.push(res.body.items.length);
          seen.push(...res.body.items.map((i: any) => i.id));
          cursor = res.body.nextCursor;
          expect(res.body.summary.total).toBe(5); // el balance no depende de la página
          if (!cursor) break;
        }
        return { seen, pages };
      }

      it('recorre todo en páginas sin repetir ni saltarse ningún reto', async () => {
        const { ana, ids } = await fiveGames();
        const { seen, pages } = await walk(ana, 2);
        expect(pages).toEqual([2, 2, 1]);
        expect(seen).toEqual([...ids].reverse());
      });

      it('no repite ni salta retos que cerraron en el mismo instante (desempate por id)', async () => {
        const { ana, ids } = await fiveGames();
        const sameInstant = new Date();
        await prisma.challenge.updateMany({ where: { id: { in: ids } }, data: { closedAt: sameInstant } });
        const { seen } = await walk(ana, 2);
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
        expect([...seen].sort()).toEqual([...ids].sort());
        expect(seen).toEqual([...seen].sort().reverse()); // dentro del empate: id descendente
      });

      it('la última página no trae cursor y el límite exacto tampoco deja una página vacía', async () => {
        const { ana } = await fiveGames();
        const exact = await history(ana, '?limit=5').expect(200);
        expect(exact.body.items).toHaveLength(5);
        expect(exact.body.nextCursor).toBeNull();
        const beyond = await history(ana, '?limit=3').expect(200);
        expect(beyond.body.nextCursor).not.toBeNull();
      });

      it('valida el límite (positivo y entero, con tope de 50) y el cursor', async () => {
        const { ana } = await fiveGames();
        await history(ana, '?limit=0').expect(400);
        await history(ana, '?limit=-3').expect(400);
        await history(ana, '?limit=abc').expect(400);
        await history(ana, '?limit=2.5').expect(400);
        await history(ana, '?limit=1000').expect(200); // se acota a 50, no falla
        await history(ana, '?cursor=basura').expect(400);
        const fakeCursor = Buffer.from('no-es-una-fecha|abc').toString('base64url');
        await history(ana, `?cursor=${fakeCursor}`).expect(400);
        await history(ana, `?cursor=${Buffer.from('2026-01-01T00:00:00.000Z').toString('base64url')}`).expect(400); // sin id
      });

      it('combina paginación con el filtro por rival', async () => {
        const { ana, beto } = await fiveGames();
        const carla = await register('carla');
        await play(ana, carla, ['WIN', 'LOSS'], { title: 'vs Carla' });
        const first = await history(ana, `?with=${beto.id}&limit=3`).expect(200);
        expect(first.body.items).toHaveLength(3);
        const second = await history(ana, `?with=${beto.id}&limit=3&cursor=${first.body.nextCursor}`).expect(200);
        expect(second.body.items).toHaveLength(2);
        expect(second.body.nextCursor).toBeNull();
        const all = [...first.body.items, ...second.body.items];
        expect(all.every((i: any) => i.rival.id === beto.id)).toBe(true);
        expect(first.body.summary.total).toBe(5);
      });
    });
  });
});
