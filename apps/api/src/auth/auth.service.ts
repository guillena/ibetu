import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { bandOf, type CredibilityBand } from '../credibility/credibility.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export const BONUS_INIT_COINS = 50;
export const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export interface InstantRegisterInput {
  displayName: string;
  username: string;
  /** Código del reto desde cuyo link llegó el usuario; permite atribuir al invitador. */
  inviteCode?: string;
}

export interface InstantRegisterResult {
  accessToken: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    coinsAvailable: number;
    credibilityScore: number;
    credibilityStatus: CredibilityBand;
    whatsappLinked: boolean;
  };
}

export interface WhatsappLoginUrlResult {
  messageText: string;
  whatsappUrl: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  /** Devuelve el enlace wa.me público para que un usuario registrado pida su Magic Link al bot. */
  getWhatsappLoginUrl(): WhatsappLoginUrlResult {
    const bot = process.env.WHATSAPP_BOT_NUMBER ?? '5490000000000';
    const messageText = 'Quiero entrar a mi cuenta IBetU';
    return {
      messageText,
      whatsappUrl: `https://wa.me/${bot}?text=${encodeURIComponent(messageText)}`,
    };
  }

  /** Genera un Magic Link de un solo uso (10 min) para que el usuario reingrese. */
  async createMagicLink(
    userId: string,
  ): Promise<{ token: string; url: string; expiresInSeconds: number }> {
    const token = randomBytes(24).toString('base64url');
    await this.redis.set(`magic:${token}`, userId, MAGIC_LINK_TTL_SECONDS);
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      token,
      url: `${base}/auth/magic?token=${token}`,
      expiresInSeconds: MAGIC_LINK_TTL_SECONDS,
    };
  }

  /** Canjea el Magic Link: lo consume (uso único) y emite una nueva sesión. */
  async magicLogin(token: string): Promise<InstantRegisterResult> {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Enlace inválido o vencido.');
    }
    // getdel es atómico: dos canjes simultáneos no pueden ganar ambos.
    const userId = await this.redis.getdel(`magic:${token}`);
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (!user) {
      throw new UnauthorizedException('Enlace inválido o vencido.');
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    const score = user.credibilityScore ?? 100;
    return {
      accessToken,
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        coinsAvailable: user.coinsAvailable,
        credibilityScore: score,
        credibilityStatus: bandOf(score),
        whatsappLinked: Boolean(user.whatsappPhone),
      },
    };
  }

  /** Normaliza el @usuario: sin arroba inicial, en minúsculas y sin espacios. */
  static normalizeUsername(raw: string): string {
    return (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
  }

  async instantRegister(
    input: InstantRegisterInput,
  ): Promise<InstantRegisterResult> {
    const displayName = (input.displayName ?? '').trim();
    const username = AuthService.normalizeUsername(input.username);

    if (displayName.length < 1 || displayName.length > 40) {
      throw new BadRequestException(
        'El nombre debe tener entre 1 y 40 caracteres.',
      );
    }
    if (!USERNAME_REGEX.test(username)) {
      throw new BadRequestException(
        'El @usuario debe tener 3 a 20 caracteres: letras, números o guion bajo.',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw await this.usernameTakenError(username);
    }

    let invitedById: string | undefined;
    if (input.inviteCode) {
      const challenge = await this.prisma.challenge.findUnique({
        where: { inviteCode: input.inviteCode },
        select: { creatorId: true },
      });
      invitedById = challenge?.creatorId;
    }

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            displayName,
            username,
            coinsAvailable: BONUS_INIT_COINS,
            ...(invitedById ? { invitedById } : {}),
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId: created.id,
            currency: 'COINS',
            type: 'BONUS_INIT',
            amount: BONUS_INIT_COINS,
            idempotencyKey: `bonus_init:${created.id}`,
          },
        });
        return created;
      });
    } catch (err: any) {
      // Carrera: otro registro tomó el @usuario entre la consulta y el alta.
      if (err?.code === 'P2002') {
        throw await this.usernameTakenError(username);
      }
      throw err;
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    const score = user.credibilityScore ?? 100;

    return {
      accessToken,
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        coinsAvailable: user.coinsAvailable,
        credibilityScore: score,
        credibilityStatus: bandOf(score),
        whatsappLinked: Boolean(user.whatsappPhone),
      },
    };
  }

  private async usernameTakenError(username: string) {
    const suggestions: string[] = [];
    for (let i = 0; i < 3 && suggestions.length < 3; i++) {
      const candidate = `${username}${Math.floor(10 + Math.random() * 990)}`.slice(
        0,
        20,
      );
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!taken && !suggestions.includes(candidate)) suggestions.push(candidate);
    }
    return new ConflictException({
      message: `El @${username} no está disponible.`,
      suggestions,
    });
  }
}

