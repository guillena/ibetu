import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export const BONUS_WSP_COINS = 50;
export const LINK_TOKEN_TTL_SECONDS = 15 * 60;
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_REGEX = /VINC-([A-Z0-9]{6})/i;
const LOGIN_REGEX = /\bentrar\b/i;

export interface LinkTokenResult {
  token: string;
  waUrl: string;
  expiresInSeconds: number;
}

export interface IncomingResult {
  linked: boolean;
  reason?: 'INVALID_TOKEN' | 'PHONE_IN_USE' | 'NOT_LINKED';
  userId?: string;
  bonusGranted?: boolean;
  /** true cuando el mensaje fue un pedido de ingreso y se generó un Magic Link. */
  loginLinkSent?: boolean;
  magicLink?: string;
  /** Texto sugerido para responder por WhatsApp al remitente. */
  reply: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(FriendsService) private readonly friends: FriendsService,
  ) {}

  static normalizePhone(raw: string): string {
    return (raw ?? '').replace(/\D/g, '');
  }

  private generateCode(): string {
    const bytes = randomBytes(6);
    let out = '';
    for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
    return out;
  }

  /** Genera un token temporal y el enlace wa.me con el mensaje pre-armado. */
  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    const token = `VINC-${this.generateCode()}`;
    await this.redis.set(`wsplink:${token}`, userId, LINK_TOKEN_TTL_SECONDS);
    const bot = process.env.WHATSAPP_BOT_NUMBER ?? '5490000000000';
    const text = encodeURIComponent(`Vincular mi cuenta IBetU #${token}`);
    return {
      token,
      waUrl: `https://wa.me/${bot}?text=${text}`,
      expiresInSeconds: LINK_TOKEN_TTL_SECONDS,
    };
  }

  /** Procesa un mensaje entrante del bot: valida el código y vincula el teléfono remitente. */
  async handleIncomingMessage(from: string, text: string): Promise<IncomingResult> {
    const phone = WhatsappService.normalizePhone(from);
    const match = TOKEN_REGEX.exec(text ?? '');
    if (phone && !match && LOGIN_REGEX.test(text ?? '')) {
      return this.handleLoginRequest(phone);
    }
    if (!phone || !match) {
      return this.invalid();
    }

    const token = `VINC-${match[1].toUpperCase()}`;
    // getdel: el código se consume al leerlo (uso único).
    const userId = await this.redis.getdel(`wsplink:${token}`);
    if (!userId) {
      return this.invalid();
    }

    const owner = await this.prisma.user.findUnique({ where: { whatsappPhone: phone } });
    if (owner && owner.id !== userId) {
      return {
        linked: false,
        reason: 'PHONE_IN_USE',
        reply: 'Ese número de WhatsApp ya está vinculado a otra cuenta de IBetU.',
      };
    }

    const bonusGranted = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { whatsappPhone: phone } });

      const key = `bonus_wsp:${userId}`;
      const already = await tx.walletTransaction.findUnique({ where: { idempotencyKey: key } });
      if (already) return false;

      await tx.walletTransaction.create({
        data: {
          userId,
          currency: 'COINS',
          type: 'BONUS_WSP',
          amount: BONUS_WSP_COINS,
          idempotencyKey: key,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { coinsAvailable: { increment: BONUS_WSP_COINS } },
      });
      return true;
    });

    this.logger.log(`WhatsApp vinculado a usuario ${userId} (bonus=${bonusGranted})`);
    // Si ya había activado su primer reto, la vinculación completa la condición del premio.
    await this.friends.tryGrantReferral(userId);
    return {
      linked: true,
      userId,
      bonusGranted,
      reply: bonusGranted
        ? `¡Listo! Tu WhatsApp quedó vinculado y sumaste ${BONUS_WSP_COINS} monedas.`
        : 'Tu WhatsApp ya estaba vinculado. ¡Todo en orden!',
    };
  }

  /** Pedido "Entrar a mi cuenta": responde con un Magic Link si el número está vinculado. */
  private async handleLoginRequest(phone: string): Promise<IncomingResult> {
    const user = await this.prisma.user.findUnique({ where: { whatsappPhone: phone } });
    if (!user) {
      return {
        linked: false,
        reason: 'NOT_LINKED',
        reply:
          'No encontramos una cuenta vinculada a este número. Abrí un reto desde el link de un amigo y vinculá tu WhatsApp.',
      };
    }
    const link = await this.auth.createMagicLink(user.id);
    this.logger.log(`Magic link emitido para usuario ${user.id}`);
    return {
      linked: true,
      userId: user.id,
      loginLinkSent: true,
      magicLink: link.url,
      reply: `Entrá a tu cuenta con este enlace (vale 10 minutos y se usa una sola vez): ${link.url}`,
    };
  }

  private invalid(): IncomingResult {
    return {
      linked: false,
      reason: 'INVALID_TOKEN',
      reply:
        'El código de vinculación no es válido o venció. Generá uno nuevo desde la app de IBetU.',
    };
  }
}

