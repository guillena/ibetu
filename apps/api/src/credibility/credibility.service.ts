import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CredibilityEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { COUNTER_BY_TYPE, buildView, computeScore, credibilityKey } from './credibility.js';
import type { CredibilityView } from './credibility.js';

/** Cliente de transacción interactiva de Prisma. */
type Tx = Prisma.TransactionClient;

/**
 * Registra un hecho de credibilidad dentro de la transacción recibida (el cierre del reto,
 * el reclamo de incumplimiento): o se aplica todo junto o no se aplica nada.
 *
 * Idempotente: cada hecho (tipo + reto + usuario) cuenta una sola vez, y el usuario se
 * bloquea mientras se actualiza para que dos cierres simultáneos no pisen el contador.
 * Devuelve true si este llamado registró el hecho.
 */
export async function recordCredibilityEvent(
  tx: Tx,
  input: { userId: string; challengeId: string; type: CredibilityEventType },
): Promise<boolean> {
  const { userId, challengeId, type } = input;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

  const idempotencyKey = credibilityKey(type, challengeId, userId);
  if (await tx.credibilityEvent.findUnique({ where: { idempotencyKey } })) return false;

  await tx.credibilityEvent.create({ data: { userId, challengeId, type, idempotencyKey } });
  const counter = COUNTER_BY_TYPE[type];
  const user = await tx.user.update({
    where: { id: userId },
    data: { [counter]: { increment: 1 } },
  });
  await tx.user.update({
    where: { id: userId },
    data: {
      credibilityScore: computeScore(
        user.cleanClosedCount,
        user.disputeLostCount + user.paymentDefaultCount,
      ),
    },
  });
  return true;
}

@Injectable()
export class CredibilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Termómetro de un usuario: puntaje, color y los datos duros que lo explican. */
  async getCredibility(userId: string): Promise<CredibilityView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('El usuario no existe.');
    return buildView(user);
  }

  /**
   * Reconstruye los contadores y el puntaje desde los asientos (la fuente de verdad).
   * Sirve para auditar y reparar cualquier desvío.
   */
  async recompute(userId: string): Promise<CredibilityView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const grouped = await tx.credibilityEvent.groupBy({
        by: ['type'],
        where: { userId },
        _count: { _all: true },
      });
      const n = (t: CredibilityEventType) => grouped.find((g) => g.type === t)?._count._all ?? 0;
      const clean = n('CLEAN_AGREEMENT');
      const lost = n('DISPUTE_LOST');
      const defaults = n('PAYMENT_DEFAULT');
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          cleanClosedCount: clean,
          disputeLostCount: lost,
          paymentDefaultCount: defaults,
          credibilityScore: computeScore(clean, lost + defaults),
        },
      });
      return buildView(user);
    });
  }
}

