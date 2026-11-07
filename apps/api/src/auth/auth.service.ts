import { createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export const BONUS_INIT_COINS = 100;
export const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export type OAuthProvider = 'GOOGLE' | 'APPLE';

export interface AuthUserPayload {
  id: string;
  displayName: string;
  username: string;
  email?: string | null;
  coinsAvailable: number;
  credibilityScore: number;
  credibilityStatus: 'GREEN' | 'YELLOW' | 'RED';
  whatsappLinked: boolean;
}

export interface InstantRegisterInput {
  displayName: string;
  username: string;
  /** Código del reto desde cuyo link llegó el usuario; permite atribuir al invitador. */
  inviteCode?: string;
}

export interface InstantRegisterResult {
  accessToken: string;
  user: AuthUserPayload;
}

export interface OAuthVerifyInput {
  provider: OAuthProvider;
  idToken: string;
  displayNameHint?: string;
}

export type OAuthVerifyResult =
  | {
      status: 'AUTHENTICATED';
      accessToken: string;
      user: AuthUserPayload;
    }
  | {
      status: 'NEEDS_PROFILE';
      onboardingToken: string;
      provider: OAuthProvider;
      email: string;
      suggestedDisplayName: string;
      suggestedUsername: string;
    };

export interface CompleteOAuthProfileInput {
  onboardingToken: string;
  displayName: string;
  username: string;
  inviteCode?: string;
}

interface VerifiedOAuthIdentity {
  provider: OAuthProvider;
  sub: string;
  email: string;
  displayName?: string;
}

interface OAuthOnboardingJwtPayload {
  purpose: 'oauth_onboarding';
  provider: OAuthProvider;
  sub: string;
  email: string;
  suggestedDisplayName: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  private mapUser(user: {
    id: string;
    displayName: string;
    username: string;
    email?: string | null;
    coinsAvailable: number;
    credibilityScore?: number;
    whatsappPhone?: string | null;
    googleSub?: string | null;
    appleSub?: string | null;
  }): AuthUserPayload {
    const score = typeof user.credibilityScore === 'number' ? user.credibilityScore : 100;
    const band: 'GREEN' | 'YELLOW' | 'RED' =
      score >= 80 ? 'GREEN' : score >= 50 ? 'YELLOW' : 'RED';
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      email: user.email ?? null,
      coinsAvailable: user.coinsAvailable,
      credibilityScore: score,
      credibilityStatus: band,
      whatsappLinked: Boolean(user.whatsappPhone || user.googleSub || user.appleSub),
    };
  }

  /** Normaliza el @usuario: sin arroba inicial, en minúsculas y sin espacios. */
  static normalizeUsername(raw: string): string {
    return (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
  }

  /** Genera un @usuario base válido a partir de un nombre o correo. */
  static sanitizeUsernameCandidate(raw: string): string {
    const cleaned = (raw ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16);
    if (cleaned.length >= 3) return cleaned;
    return `jugador_${Math.floor(100 + Math.random() * 900)}`;
  }

  /**
   * Verifica el ID Token de Google o Apple.
   * Si el usuario ya existe, emite sesión directamente (`AUTHENTICATED`).
   * Si es nuevo, devuelve `NEEDS_PROFILE` con un `onboardingToken` y sugerencias de perfil.
   */
  async verifyOAuthToken(input: OAuthVerifyInput): Promise<OAuthVerifyResult> {
    const provider = input?.provider;
    if (provider !== 'GOOGLE' && provider !== 'APPLE') {
      throw new BadRequestException('Proveedor inválido. Elegí Google o Apple.');
    }
    const rawToken = (input?.idToken ?? '').trim();
    if (!rawToken) {
      throw new UnauthorizedException('No se recibió el token de autenticación.');
    }

    const identity = await this.extractOAuthIdentity(
      provider,
      rawToken,
      input?.displayNameHint,
    );

    const existingBySub = await this.prisma.user.findUnique({
      where: provider === 'GOOGLE' ? { googleSub: identity.sub } : { appleSub: identity.sub },
    });
    const existingByEmail =
      !existingBySub && identity.email
        ? await this.prisma.user.findUnique({ where: { email: identity.email } })
        : null;

    let existing = existingBySub ?? existingByEmail;
    if (existing) {
      const needsSubLink =
        (provider === 'GOOGLE' && !existing.googleSub) ||
        (provider === 'APPLE' && !existing.appleSub) ||
        (!existing.email && Boolean(identity.email));

      if (needsSubLink && typeof this.prisma.user.update === 'function') {
        existing = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(provider === 'GOOGLE' && !existing.googleSub ? { googleSub: identity.sub } : {}),
            ...(provider === 'APPLE' && !existing.appleSub ? { appleSub: identity.sub } : {}),
            ...(!existing.email && identity.email ? { email: identity.email } : {}),
          },
        });
      }

      const accessToken = await this.jwt.signAsync({
        sub: existing.id,
        username: existing.username,
      });

      return {
        status: 'AUTHENTICATED',
        accessToken,
        user: this.mapUser(existing),
      };
    }

    const emailLocal = identity.email.split('@')[0] ?? 'Jugador';
    const suggestedDisplayName = (
      input?.displayNameHint?.trim() ||
      identity.displayName?.trim() ||
      emailLocal
    ).slice(0, 40);

    const baseCandidate = AuthService.sanitizeUsernameCandidate(
      suggestedDisplayName || emailLocal,
    );
    let suggestedUsername = baseCandidate;
    const isTaken = await this.prisma.user.findUnique({
      where: { username: suggestedUsername },
    });
    if (isTaken) {
      for (let i = 0; i < 5; i++) {
        const alt = `${baseCandidate.slice(0, 15)}_${Math.floor(10 + Math.random() * 89)}`;
        const takenAlt = await this.prisma.user.findUnique({ where: { username: alt } });
        if (!takenAlt) {
          suggestedUsername = alt;
          break;
        }
      }
    }

    const onboardingPayload: OAuthOnboardingJwtPayload = {
      purpose: 'oauth_onboarding',
      provider,
      sub: identity.sub,
      email: identity.email,
      suggestedDisplayName,
    };
    const onboardingToken = await this.jwt.signAsync(onboardingPayload);

    return {
      status: 'NEEDS_PROFILE',
      onboardingToken,
      provider,
      email: identity.email,
      suggestedDisplayName,
      suggestedUsername,
    };
  }

  /**
   * Completa el registro inicial confirmando el Nombre y @usuario único luego de
   * validar Google o Apple, acreditando las 100 monedas de bienvenida.
   */
  async completeOAuthProfile(
    input: CompleteOAuthProfileInput,
  ): Promise<InstantRegisterResult> {
    if (!input?.onboardingToken) {
      throw new UnauthorizedException(
        'La sesión de registro venció. Volvé a elegir Google o Apple.',
      );
    }

    let payload: OAuthOnboardingJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<OAuthOnboardingJwtPayload>(
        input.onboardingToken,
      );
    } catch {
      throw new UnauthorizedException(
        'La sesión de registro venció. Volvé a elegir Google o Apple.',
      );
    }

    if (
      payload?.purpose !== 'oauth_onboarding' ||
      (payload.provider !== 'GOOGLE' && payload.provider !== 'APPLE') ||
      !payload.sub
    ) {
      throw new UnauthorizedException(
        'La sesión de registro no es válida. Volvé a elegir Google o Apple.',
      );
    }

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

    const existingUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
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
            email: payload.email || null,
            ...(payload.provider === 'GOOGLE'
              ? { googleSub: payload.sub }
              : { appleSub: payload.sub }),
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
      if (err?.code === 'P2002') {
        throw await this.usernameTakenError(username);
      }
      throw err;
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });

    return {
      accessToken,
      user: this.mapUser(user),
    };
  }

  private async extractOAuthIdentity(
    provider: OAuthProvider,
    idToken: string,
    displayNameHint?: string,
  ): Promise<VerifiedOAuthIdentity> {
    const configuredClientId =
      provider === 'GOOGLE'
        ? process.env.GOOGLE_CLIENT_ID?.trim()
        : process.env.APPLE_CLIENT_ID?.trim();
    const allowDevToken =
      process.env.NODE_ENV !== 'production' ||
      process.env.OAUTH_ALLOW_DEV_TOKENS === 'true' ||
      !configuredClientId;

    if (idToken.startsWith('dev:') && allowDevToken) {
      const parts = idToken.split(':');
      // Soporta `dev:GOOGLE:sub123:mail@test.com:Nombre` o `dev:sub123:mail@test.com:Nombre`
      const hasProviderPrefix =
        parts[1]?.toUpperCase() === 'GOOGLE' || parts[1]?.toUpperCase() === 'APPLE';
      const sub = (hasProviderPrefix ? parts[2] : parts[1])?.trim();
      const email = (hasProviderPrefix ? parts[3] : parts[2])?.trim().toLowerCase();
      const name = (hasProviderPrefix ? parts.slice(4).join(':') : parts.slice(3).join(':'))?.trim();

      if (!sub || !email) {
        throw new UnauthorizedException('Token de prueba OAuth incompleto.');
      }
      return {
        provider,
        sub,
        email,
        displayName: name || displayNameHint?.trim() || email.split('@')[0],
      };
    }

    return this.verifyOidcJwt(provider, idToken, displayNameHint);
  }

  private async verifyOidcJwt(
    provider: OAuthProvider,
    idToken: string,
    displayNameHint?: string,
  ): Promise<VerifiedOAuthIdentity> {
    const segments = idToken.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedException('El token de identidad no tiene un formato JWT válido.');
    }

    const [headerB64, payloadB64, signatureB64] = segments;
    let header: { kid?: string; alg?: string };
    let payload: {
      iss?: string;
      sub?: string;
      email?: string;
      name?: string;
      aud?: string | string[];
      exp?: number;
    };

    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('No se pudo decodificar el token de identidad.');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('El token de identidad no incluye un identificador (sub).');
    }
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('El token de identidad ha expirado.');
    }

    const jwksUrl =
      provider === 'GOOGLE'
        ? 'https://www.googleapis.com/oauth2/v3/certs'
        : 'https://appleid.apple.com/auth/keys';

    const validIssuers =
      provider === 'GOOGLE'
        ? ['https://accounts.google.com', 'accounts.google.com']
        : ['https://appleid.apple.com'];

    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new UnauthorizedException('Emisor del token de identidad no válido.');
    }

    const expectedClientId =
      provider === 'GOOGLE' ? process.env.GOOGLE_CLIENT_ID : process.env.APPLE_CLIENT_ID;
    if (expectedClientId) {
      const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audList.includes(expectedClientId)) {
        throw new UnauthorizedException('El token no corresponde a esta aplicación (aud).');
      }
    }

    let keys: Array<JsonWebKey & { kid?: string }> = [];
    try {
      const res = await fetch(jwksUrl);
      const data = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
      keys = data.keys ?? [];
    } catch {
      throw new UnauthorizedException('No se pudieron obtener las claves públicas del proveedor.');
    }

    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      throw new UnauthorizedException('Clave pública del proveedor no encontrada.');
    }

    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const verified = cryptoVerify(
      'RSA-SHA256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      publicKey,
      Buffer.from(signatureB64, 'base64url'),
    );

    if (!verified) {
      throw new UnauthorizedException('Firma del token de identidad inválida.');
    }

    const email = (payload.email ?? `${payload.sub}@privaterelay.ibetu.online`).toLowerCase();
    return {
      provider,
      sub: payload.sub,
      email,
      displayName: payload.name || displayNameHint?.trim() || email.split('@')[0],
    };
  }

  /** Genera un Magic Link de un solo uso (10 min) para compatibilidad con tests de integración. */
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
    return {
      accessToken,
      user: this.mapUser(user),
    };
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
      if (err?.code === 'P2002') {
        throw await this.usernameTakenError(username);
      }
      throw err;
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });

    return {
      accessToken,
      user: this.mapUser(user),
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
