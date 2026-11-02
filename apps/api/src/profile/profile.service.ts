import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CredibilityBand } from '../credibility/credibility.js';
import { buildView } from '../credibility/credibility.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Perfil visible: solo lo que fija la spec (jugados, victorias y % Fair Play). */
export interface ProfileView {
  id: string;
  username: string;
  displayName: string;
  memberSince: Date;
  isSelf: boolean;
  whatsappLinked?: boolean;
  totalPlayed: number;
  totalWins: number;
  credibility: {
    /** % Fair Play (0–100). */
    score: number;
    band: CredibilityBand;
    /** true mientras haya poco historial para que el puntaje sea representativo. */
    provisional: boolean;
  };
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FriendsService) private readonly friends: FriendsService,
  ) {}

  /**
   * Perfil de un usuario. `me` equivale al propio. Lo pueden ver: uno mismo, sus amigos y
   * quienes comparten un reto con él (por ejemplo el rival o el Juez); el resto, no.
   */
  async getProfile(viewerId: string, id: string): Promise<ProfileView> {
    const targetId = id === 'me' ? viewerId : id;
    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!user) throw new NotFoundException('El usuario no existe.');

    const isSelf = targetId === viewerId;
    if (!isSelf && !(await this.canView(viewerId, targetId))) {
      throw new ForbiddenException('Solo podés ver el perfil de tus amigos y de quienes jugaron un reto con vos.');
    }

    const c = buildView(user);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      memberSince: user.createdAt,
      isSelf,
      ...(isSelf ? { whatsappLinked: Boolean(user.whatsappPhone) } : {}),
      totalPlayed: c.totalPlayed,
      totalWins: c.totalWins,
      credibility: { score: c.score, band: c.band, provisional: c.provisional },
    };
  }

  private async canView(viewerId: string, targetId: string): Promise<boolean> {
    if (await this.friends.areFriends(viewerId, targetId)) return true;
    const shared = await this.prisma.challenge.findFirst({
      where: {
        AND: [
          { OR: [{ creatorId: viewerId }, { opponentId: viewerId }, { judgeId: viewerId }] },
          { OR: [{ creatorId: targetId }, { opponentId: targetId }, { judgeId: targetId }] },
        ],
      },
      select: { id: true },
    });
    return shared !== null;
  }
}

