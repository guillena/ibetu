import { Inject, Injectable } from '@nestjs/common';
import type { CredibilityBand } from '../credibility/credibility.js';
import { buildView } from '../credibility/credibility.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const REFERRAL_COINS = 30;

export interface FriendView {
  id: string;
  displayName: string;
  username: string;
  since: Date;
  credibility: {
    score: number;
    band: CredibilityBand;
    provisional: boolean;
  };
}

@Injectable()
export class FriendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** La amistad es bidireccional y se guarda una sola vez con el par ordenado. */
  private static orderedPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  async connectFriends(userId: string, otherId: string): Promise<void> {
    if (!userId || !otherId || userId === otherId) return;
    const [userAId, userBId] = FriendsService.orderedPair(userId, otherId);
    await this.prisma.friendship.createMany({
      data: [{ userAId, userBId }],
      skipDuplicates: true,
    });
  }

  /** ¿Son amigos? La amistad se guarda una sola vez con el par ordenado. */
  async areFriends(a: string, b: string): Promise<boolean> {
    if (!a || !b || a === b) return false;
    const [userAId, userBId] = FriendsService.orderedPair(a, b);
    const row = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    return row !== null;
  }

  async listFriends(userId: string): Promise<FriendView[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => {
      const other = r.userAId === userId ? r.userB : r.userA;
      const c = buildView(other);
      return {
        id: other.id,
        displayName: other.displayName,
        username: other.username,
        since: r.createdAt,
        credibility: { score: c.score, band: c.band, provisional: c.provisional },
      };
    });
  }

  /**
   * Premio por viralidad: +30 monedas al invitador cuando el invitado ya tiene
   * una identidad verificada (Google, Apple, email o WhatsApp) Y activó su primer reto.
   * Se acredita una sola vez. Devuelve true si este llamado acreditó el premio.
   */
  async tryGrantReferral(inviteeId: string): Promise<boolean> {
    const invitee = await this.prisma.user.findUnique({ where: { id: inviteeId } });
    const hasVerifiedIdentity = Boolean(
      invitee?.googleSub || invitee?.appleSub || invitee?.email || invitee?.whatsappPhone,
    );
    if (!invitee?.invitedById || !hasVerifiedIdentity) return false;
    if (invitee.invitedById === invitee.id) return false;

    const activated = await this.prisma.challenge.count({
      where: {
        OR: [{ creatorId: inviteeId }, { opponentId: inviteeId }],
        status: { in: ['ACTIVE', 'RESULT', 'DISPUTE', 'CLOSED'] },
      },
    });
    if (activated < 1) return false;

    const inviterId = invitee.invitedById;
    const key = `referral:${inviterId}:${inviteeId}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const already = await tx.walletTransaction.findUnique({
          where: { idempotencyKey: key },
        });
        if (already) return false;
        await tx.walletTransaction.create({
          data: {
            userId: inviterId,
            currency: 'COINS',
            type: 'REFERRAL',
            amount: REFERRAL_COINS,
            idempotencyKey: key,
          },
        });
        await tx.user.update({
          where: { id: inviterId },
          data: { coinsAvailable: { increment: REFERRAL_COINS } },
        });
        return true;
      });
    } catch (err: any) {
      // Carrera con otro llamado concurrente: la clave única impidió el doble premio.
      if (err?.code === 'P2002') return false;
      throw err;
    }
  }

  /**
   * Se invoca cuando un reto pasa a ACTIVO (aceptación): conecta a ambos jugadores
   * como amigos y evalúa el premio por viralidad del invitado.
   */
  async onChallengeAccepted(creatorId: string, accepterId: string) {
    await this.connectFriends(creatorId, accepterId);
    const referralGranted = await this.tryGrantReferral(accepterId);
    return { referralGranted };
  }
}

