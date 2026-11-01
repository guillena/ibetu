process.env.CLOCKS_ENABLED = 'false'; // sin worker: los relojes se simulan en las pruebas
process.env.CLOCK_QUEUE_NAME = `test-http-open-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CLOCK_SCHEDULER } from '../src/clocks/clock-scheduler.js';
import type { BullClockScheduler } from '../src/clocks/clock-scheduler.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type U = { id: string; token: string; username: string };
type Vote = 'WIN' | 'LOSS' | 'DRAW';
type Item = Record<string, any>;

const FORBIDDEN = ['level', 'nivel', 'streak', 'racha', 'multiplier', 'phone', 'whatsapp', 'winnerid'];

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

// Requiere `npm run db:up`. Se corre con `npm run test:e2e` (servidor HTTP real en memoria).
describe('API – retos abiertos del usuario (GET /challenges)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
  const inHours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

  async function register(label: string): Promise<U> {
    const username = `e2e_${label}_${randomUUID().slice(0, 6)}`.toLowerCase();
    const res = await api().post('/auth/instant-register').send({ displayName: label, username }).expect(201);
    userIds.push(res.body.user.id);
    return { id: res.body.user.id, token: res.body.accessToken, username };
  }

  async function create(creator: U, body: Record<string, unknown> = {}): Promise<string> {
    const res = await api()
      .post('/challenges')
      .set(auth(creator))
      .send({ title: 'Emboque de papel', stakeAmount: 10, expiresAt: inHours(48), ...body })
      .expect(201);
    return res.body.id;
  }
  const accept = (u: U, id: string) => api().post(`/challenges/${id}/accept`).set(auth(u)).expect(200);
  const declare = (u: U, id: string, vote: Vote) =>
    api().post(`/challenges/${id}/declare`).set(auth(u)).send({ vote }).expect(200);

  /** Dos usuarios que ya son amigos (jugaron y empataron un reto). */
  async function friends(): Promise<[U, U]> {
    const a = await register('ana');
    const b = await register('beto');
    const id = await create(a);
    await accept(b, id);
    await declare(a, id, 'DRAW');
    await declare(b, id, 'DRAW');
    return [a, b];
  }

  async function list(u: U): Promise<{ items: Item[]; counts: Record<string, number> }> {
    const res = await api().get('/challenges').set(auth(u)).expect(200);
    return res.body;
  }
  const find = async (u: U, id: string) => (await list(u)).items.find((i) => i.id === id);
  const tabs = (items: Item[]) => items.map((i) => i.tab);

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
    await (app.get<BullClockScheduler>(CLOCK_SCHEDULER)).queue.obliterate({ force: true });
    await app.close();
  });

  it('exige sesión', async () => {
    await api().get('/challenges').expect(401);
  });

  it('un usuario sin retos recibe la lista vacía y los conteos en cero', async () => {
    const ana = await register('ana');
    expect((await list(ana))).toEqual({
      items: [],
      counts: { inPlay: 0, toDeclare: 0, toDeclareActionNeeded: 0, invitationsReceived: 0, invitationsSent: 0 },
    });
  });

  it('no pisa a GET /challenges/presets ni a GET /challenges/history', async () => {
    const ana = await register('ana');
    const presets = await api().get('/challenges/presets').set(auth(ana)).expect(200);
    expect(Array.isArray(presets.body)).toBe(true);
    expect(presets.body.length).toBeGreaterThan(0);
    const history = await api().get('/challenges/history').set(auth(ana)).expect(200);
    expect(history.body).toHaveProperty('summary');
  });

  describe('el ciclo completo de un reto, visto por cada participante', () => {
    it('invitación enviada y recibida → en juego → por declarar → disputa → Juez → cerrado', async () => {
      const [ana, beto] = await friends();
      const juez = await register('juez');
      // El Juez es amigo de Ana.
      const hacerAmigos = await create(ana);
      await accept(juez, hacerAmigos);
      await declare(ana, hacerAmigos, 'DRAW');
      await declare(juez, hacerAmigos, 'DRAW');

      // 1) Ana desafía a Beto: invitación enviada / recibida.
      const id = await create(ana, { opponentId: beto.id, title: 'Partida de ping pong' });
      const enviada = await find(ana, id);
      expect(enviada).toMatchObject({
        tab: 'INVITATION_SENT', role: 'CREATOR', status: 'PENDING', actionNeeded: false, pot: 20,
        rival: { id: beto.id, username: beto.username }, shareUrl: expect.stringContaining('/r/'),
      });
      const recibida = await find(beto, id);
      expect(recibida).toMatchObject({
        tab: 'INVITATION_RECEIVED', role: 'OPPONENT', actionNeeded: true,
        rival: { id: ana.id }, shareUrl: null, // me invitaron: el enlace no es mío para compartir
      });
      expect((await list(juez)).items.find((i) => i.id === id)).toBeUndefined();

      // 2) Beto acepta: ambos lo ven "En Juego", sin acción pendiente.
      await accept(beto, id);
      for (const [u, role] of [[ana, 'CREATOR'], [beto, 'OPPONENT']] as const) {
        expect(await find(u, id)).toMatchObject({ tab: 'IN_PLAY', role, status: 'ACTIVE', actionNeeded: false, myVote: null, shareUrl: null });
      }

      // 3) Ana declara "gané": pasa a "Por Declarar". Beto debe responder; no ve el voto de Ana.
      await declare(ana, id, 'WIN');
      const anaEspera = await find(ana, id);
      expect(anaEspera).toMatchObject({ tab: 'TO_DECLARE', status: 'RESULT', actionNeeded: false, myVote: 'WIN', rivalHasVoted: false, rivalVote: null });
      const plazo = new Date(anaEspera!.silenceDeadline).getTime() - Date.now();
      expect(plazo).toBeGreaterThan(23.9 * 3_600_000);
      expect(plazo).toBeLessThanOrEqual(24 * 3_600_000);
      const betoDebe = await find(beto, id);
      expect(betoDebe).toMatchObject({ tab: 'TO_DECLARE', actionNeeded: true, myVote: null, rivalHasVoted: true, rivalVote: null });

      // 4) Beto también dice "gané": disputa, ambos pueden actuar y ahora sí se ven los votos.
      await declare(beto, id, 'WIN');
      for (const u of [ana, beto]) {
        expect(await find(u, id)).toMatchObject({
          tab: 'TO_DECLARE', status: 'DISPUTE', actionNeeded: true, myVote: 'WIN', rivalVote: 'WIN',
          silenceDeadline: null, judge: { proposed: false, assigned: false, verdictDeadline: null },
        });
      }

      // 5) Ana propone al Juez: ahora le toca aprobar a Beto; el Juez todavía no ve nada.
      await api().post(`/challenges/${id}/judge/propose`).set(auth(ana)).send({ judgeId: juez.id }).expect(200);
      expect(await find(ana, id)).toMatchObject({ actionNeeded: false, judge: { proposed: true, assigned: false } });
      expect(await find(beto, id)).toMatchObject({ actionNeeded: true, judge: { proposed: true, assigned: false } });
      expect(await find(juez, id)).toBeUndefined();

      // 6) Beto aprueba: los jugadores esperan el fallo y el Juez lo ve como pendiente suyo.
      await api().post(`/challenges/${id}/judge/approve`).set(auth(beto)).expect(200);
      expect(await find(ana, id)).toMatchObject({ actionNeeded: false, judge: { assigned: true } });
      expect(await find(beto, id)).toMatchObject({ actionNeeded: false });
      const delJuez = await find(juez, id);
      expect(delJuez).toMatchObject({ tab: 'TO_DECLARE', role: 'JUDGE', status: 'DISPUTE', actionNeeded: true, rival: null });
      expect(delJuez!.players.map((p: Item) => p.id).sort()).toEqual([ana.id, beto.id].sort());
      expect((await list(juez)).counts).toMatchObject({ toDeclare: 1, toDeclareActionNeeded: 1 });

      // 7) El Juez falla: el reto se cierra y sale de todas las listas (queda en el historial).
      await api().post(`/challenges/${id}/judge/verdict`).set(auth(juez)).send({ winnerId: ana.id }).expect(200);
      for (const u of [ana, beto, juez]) expect(await find(u, id)).toBeUndefined();
    });
  });

  describe('retos que salen de la lista', () => {
    it('un reto cancelado o rechazado desaparece; uno cerrado también', async () => {
      const [ana, beto] = await friends();
      const cancelado = await create(ana);
      const rechazado = await create(ana, { opponentId: beto.id });
      const cerrado = await create(ana);
      await accept(beto, cerrado);
      await declare(ana, cerrado, 'WIN');
      await declare(beto, cerrado, 'LOSS');
      expect(await find(ana, cancelado)).toBeDefined();
      expect(await find(beto, rechazado)).toBeDefined();

      await api().post(`/challenges/${cancelado}/cancel`).set(auth(ana)).expect(200);
      await api().post(`/challenges/${rechazado}/reject`).set(auth(beto)).expect(200);

      for (const u of [ana, beto]) {
        const ids = (await list(u)).items.map((i) => i.id);
        expect(ids).not.toContain(cancelado);
        expect(ids).not.toContain(rechazado);
        expect(ids).not.toContain(cerrado);
      }
    });
  });

  describe('aislamiento: cada usuario ve solo lo suyo', () => {
    it('un tercero no ve retos ajenos, ni pendientes ni en juego', async () => {
      const [ana, beto] = await friends();
      const carla = await register('carla');
      const enJuego = await create(ana);
      await accept(beto, enJuego);
      await create(ana, { opponentId: beto.id });
      await create(ana); // reto abierto por link

      expect((await list(carla)).items).toEqual([]);
      expect((await list(beto)).items).toHaveLength(2);
      expect((await list(ana)).items).toHaveLength(3);
    });

    it('un reto abierto por link solo lo ve quien lo creó hasta que otro lo acepta', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const id = await create(ana);
      expect(await find(beto, id)).toBeUndefined();
      await accept(beto, id);
      expect(await find(beto, id)).toMatchObject({ tab: 'IN_PLAY', role: 'OPPONENT', rival: { id: ana.id } });
    });
  });

  describe('orden y conteos', () => {
    it('En Juego: el que vence antes va primero; los conteos coinciden con las pestañas', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const tarde = await create(ana, { title: 'tarde', expiresAt: inHours(72) });
      const pronto = await create(ana, { title: 'pronto', expiresAt: inHours(2) });
      const medio = await create(ana, { title: 'medio', expiresAt: inHours(24) });
      for (const id of [tarde, pronto, medio]) await accept(beto, id);
      const pendiente1 = await create(ana, { title: 'pend 1' });
      const pendiente2 = await create(ana, { title: 'pend 2' });
      void pendiente1; void pendiente2;

      const result = await list(ana);
      expect(result.items.filter((i) => i.tab === 'IN_PLAY').map((i) => i.title)).toEqual(['pronto', 'medio', 'tarde']);
      expect(result.counts).toEqual({ inPlay: 3, toDeclare: 0, toDeclareActionNeeded: 0, invitationsReceived: 0, invitationsSent: 2 });
      // Agrupado por pestaña: primero En Juego y al final las invitaciones enviadas.
      expect(tabs(result.items)).toEqual(['IN_PLAY', 'IN_PLAY', 'IN_PLAY', 'INVITATION_SENT', 'INVITATION_SENT']);
    });

    it('Por Declarar: lo que requiere acción de quien consulta va primero', async () => {
      const ana = await register('ana');
      const beto = await register('beto');
      const espero = await create(ana, { title: 'yo ya declaré' });
      const meToca = await create(beto, { title: 'me toca declarar' });
      await accept(beto, espero);
      await accept(ana, meToca);
      await declare(ana, espero, 'WIN'); // Ana declaró: espera a Beto
      await declare(beto, meToca, 'WIN'); // Beto declaró: a Ana le toca

      const items = (await list(ana)).items.filter((i) => i.tab === 'TO_DECLARE');
      expect(items.map((i) => i.title)).toEqual(['me toca declarar', 'yo ya declaré']);
      expect(items.map((i) => i.actionNeeded)).toEqual([true, false]);
      expect((await list(ana)).counts).toMatchObject({ toDeclare: 2, toDeclareActionNeeded: 1 });
    });
  });

  describe('contenido', () => {
    it('modo Plata: sin pozo en monedas y con el monto por jugador', async () => {
      const [ana, beto] = await friends();
      const id = await create(ana, { mode: 'CASH', stakeAmount: 5000, opponentId: beto.id });
      expect(await find(beto, id)).toMatchObject({ mode: 'CASH', stakeAmount: 5000, pot: null });
    });

    it('cada item expone solo los campos previstos y la respuesta no trae niveles ni rachas', async () => {
      const [ana, beto] = await friends();
      const id = await create(ana, { opponentId: beto.id });
      const body = await list(ana);
      expect(Object.keys(body).sort()).toEqual(['counts', 'items']);
      expect(Object.keys(body.items.find((i) => i.id === id)!).sort()).toEqual(
        [
          'actionNeeded', 'createdAt', 'expiresAt', 'id', 'inviteCode', 'judge', 'mode', 'myVote', 'players',
          'pot', 'rival', 'rivalHasVoted', 'rivalVote', 'role', 'shareUrl', 'silenceDeadline', 'stakeAmount',
          'status', 'tab', 'title',
        ].sort(),
      );
      const keys = allKeys(body).map((k) => k.toLowerCase());
      for (const f of FORBIDDEN) expect(keys.filter((k) => k.includes(f))).toEqual([]);
    });

    it('el rival solo expone id, usuario y nombre (nada de teléfono ni saldo)', async () => {
      const [ana, beto] = await friends();
      const id = await create(ana, { opponentId: beto.id });
      const item = (await find(ana, id))!;
      expect(Object.keys(item.rival).sort()).toEqual(['displayName', 'id', 'username']);
    });
  });
});

