import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { StreakService, STREAK_BONUS_COINS, calendarDay, dayDiff } from './streak.service.js';

/** Fecha local de Argentina (UTC-3) a una hora dada. */
const at = (day: string, time = '15:00:00') => new Date(`${day}T${time}-03:00`);

describe('calendarDay / dayDiff (unitarios)', () => {
  it('usa el día calendario local, no el UTC', () => {
    // 23:30 en Argentina del 1/nov = 02:30 UTC del 2/nov, pero sigue siendo el 1/nov local.
    expect(calendarDay(at('2026-11-01', '23:30:00'))).toBe('2026-11-01');
    expect(calendarDay(at('2026-11-02', '00:30:00'))).toBe('2026-11-02');
  });

  it('calcula diferencias de días, incluso entre meses y años', () => {
    expect(dayDiff('2026-11-01', '2026-11-02')).toBe(1);
    expect(dayDiff('2026-10-31', '2026-11-01')).toBe(1);
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
    expect(dayDiff('2026-11-01', '2026-11-01')).toBe(0);
    expect(dayDiff('2026-11-03', '2026-11-01')).toBe(-2);
  });
});

// Requiere `npm run db:up` (PostgreSQL local).
describe('StreakService – Premio de Constancia (integración con PostgreSQL)', () => {
  const prisma = new PrismaService();
  const streak = new StreakService(prisma);
  const userIds: string[] = [];

  async function newUser(coins = 100) {
    const user = await prisma.user.create({
      data: { displayName: 'S', username: `s_${randomUUID().slice(0, 8)}`, coinsAvailable: coins },
    });
    userIds.push(user.id);
    return user;
  }

  const win = (ids: string[], closedAt: Date, hadDispute = false) =>
    streak.onChallengeClosed({ userIds: ids, outcome: 'WIN', hadDispute, closedAt });

  const state = async (id: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { coins: u.coinsAvailable, days: u.streakDaysCount };
  };
  const bonusTxs = (id: string) =>
    prisma.walletTransaction.findMany({ where: { userId: id, type: 'STREAK3' } });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('1 reto limpio por día durante 3 días seguidos acredita +30 el tercer día y reinicia el ciclo', async () => {
    const u = await newUser();

    const d1 = await win([u.id], at('2026-11-01'));
    expect(d1[0]).toMatchObject({ counted: true, streakDays: 1, bonusGranted: false });
    const d2 = await win([u.id], at('2026-11-02'));
    expect(d2[0]).toMatchObject({ counted: true, streakDays: 2, bonusGranted: false });
    expect(await state(u.id)).toEqual({ coins: 100, days: 2 });

    const d3 = await win([u.id], at('2026-11-03'));
    expect(d3[0]).toMatchObject({ counted: true, streakDays: 0, bonusGranted: true });
    expect(await state(u.id)).toEqual({ coins: 100 + STREAK_BONUS_COINS, days: 0 });

    const txs = await bonusTxs(u.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ amount: 30, idempotencyKey: `streak3:${u.id}:2026-11-03` });
  });

  it('el premio cuenta para ambos jugadores, haya ganado o perdido', async () => {
    const winner = await newUser();
    const loser = await newUser();
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      await win([winner.id, loser.id], at(day));
    }
    expect((await state(winner.id)).coins).toBe(130);
    expect((await state(loser.id)).coins).toBe(130);
  });

  it('un día sin jugar interrumpe la racha: se reinicia en 1 y no hay premio', async () => {
    const u = await newUser();
    await win([u.id], at('2026-11-01'));
    await win([u.id], at('2026-11-02'));
    const gap = await win([u.id], at('2026-11-04')); // saltó el 3
    expect(gap[0]).toMatchObject({ counted: true, streakDays: 1, bonusGranted: false });
    expect(await state(u.id)).toEqual({ coins: 100, days: 1 });
    expect(await bonusTxs(u.id)).toHaveLength(0);
  });

  it('varios retos el mismo día cuentan como un solo día (no se fabrica el premio)', async () => {
    const u = await newUser();
    await win([u.id], at('2026-11-01', '09:00:00'));
    const again = await win([u.id], at('2026-11-01', '12:00:00'));
    const third = await win([u.id], at('2026-11-01', '23:00:00'));
    expect(again[0].counted).toBe(false);
    expect(third[0].counted).toBe(false);
    expect(await state(u.id)).toEqual({ coins: 100, days: 1 });
  });

  it('el límite de día es la medianoche local (Argentina), no la UTC', async () => {
    const u = await newUser();
    await win([u.id], at('2026-11-01', '23:30:00')); // 02:30 UTC del día 2
    const next = await win([u.id], at('2026-11-02', '00:30:00')); // 03:30 UTC del día 2
    expect(next[0]).toMatchObject({ counted: true, streakDays: 2 }); // son días distintos
  });

  it('tras el premio el ciclo vuelve a empezar y paga de nuevo a los 3 días', async () => {
    const u = await newUser();
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) await win([u.id], at(d));
    expect(await state(u.id)).toEqual({ coins: 130, days: 0 });

    const d4 = await win([u.id], at('2026-11-04'));
    expect(d4[0]).toMatchObject({ streakDays: 1, bonusGranted: false });
    await win([u.id], at('2026-11-05'));
    const d6 = await win([u.id], at('2026-11-06'));
    expect(d6[0]).toMatchObject({ bonusGranted: true });
    expect(await state(u.id)).toEqual({ coins: 160, days: 0 });
    expect(await bonusTxs(u.id)).toHaveLength(2);
  });

  it('retos empatados o cancelados no suman el día', async () => {
    const u = await newUser();
    const draw = await streak.onChallengeClosed({
      userIds: [u.id], outcome: 'DRAW', hadDispute: false, closedAt: at('2026-11-01'),
    });
    const cancelled = await streak.onChallengeClosed({
      userIds: [u.id], outcome: 'CANCELLED', hadDispute: false, closedAt: at('2026-11-02'),
    });
    expect(draw[0].counted).toBe(false);
    expect(cancelled[0].counted).toBe(false);
    expect(await state(u.id)).toEqual({ coins: 100, days: 0 });
  });

  it('un reto que pasó por disputa no cuenta, aunque termine con ganador', async () => {
    const u = await newUser();
    const res = await win([u.id], at('2026-11-01'), true);
    expect(res[0].counted).toBe(false);
    expect(await state(u.id)).toEqual({ coins: 100, days: 0 });
  });

  it('un empate entre dos días limpios corta la racha porque ese día no cuenta', async () => {
    const u = await newUser();
    await win([u.id], at('2026-11-01'));
    await streak.onChallengeClosed({
      userIds: [u.id], outcome: 'DRAW', hadDispute: false, closedAt: at('2026-11-02'),
    });
    const d3 = await win([u.id], at('2026-11-03')); // el día 2 no contó
    expect(d3[0]).toMatchObject({ streakDays: 1, bonusGranted: false });
    expect(await bonusTxs(u.id)).toHaveLength(0);
  });

  it('cierres simultáneos del mismo día no duplican el conteo ni el premio', async () => {
    const u = await newUser();
    await win([u.id], at('2026-11-01'));
    await win([u.id], at('2026-11-02'));

    const results = await Promise.all(
      Array.from({ length: 8 }, () => win([u.id], at('2026-11-03'))),
    );
    expect(results.flat().filter((r) => r.bonusGranted)).toHaveLength(1);
    expect(await state(u.id)).toEqual({ coins: 130, days: 0 });
    expect(await bonusTxs(u.id)).toHaveLength(1);
  });
});

