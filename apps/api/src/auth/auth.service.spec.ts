import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService, BONUS_INIT_COINS } from './auth.service.js';

function makeService(
  opts: {
    takenUsernames?: string[];
    existingUsers?: Array<{
      id: string;
      displayName: string;
      username: string;
      email?: string | null;
      googleSub?: string | null;
      appleSub?: string | null;
      coinsAvailable: number;
    }>;
    failCreateWithP2002?: boolean;
  } = {},
) {
  const taken = new Set(opts.takenUsernames ?? []);
  const existingUsers = opts.existingUsers ?? [];
  const walletCreate = vi.fn().mockResolvedValue({});
  const userCreate = vi.fn().mockImplementation(async ({ data }: any) => {
    if (opts.failCreateWithP2002) throw Object.assign(new Error('dup'), { code: 'P2002' });
    return { id: 'u-1', ...data };
  });
  const userUpdate = vi.fn().mockImplementation(async ({ where, data }: any) => {
    const found = existingUsers.find((u) => u.id === where.id);
    return { ...found, ...data };
  });
  const prisma: any = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.username) {
          if (taken.has(where.username)) return { id: 'x', username: where.username };
          return existingUsers.find((u) => u.username === where.username) ?? null;
        }
        if (where.googleSub) {
          return existingUsers.find((u) => u.googleSub === where.googleSub) ?? null;
        }
        if (where.appleSub) {
          return existingUsers.find((u) => u.appleSub === where.appleSub) ?? null;
        }
        if (where.email) {
          return existingUsers.find((u) => u.email === where.email) ?? null;
        }
        return null;
      }),
      update: userUpdate,
    },
    challenge: {
      findUnique: vi.fn().mockResolvedValue({ creatorId: 'u-inviter' }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: any) =>
      fn({ user: { create: userCreate }, walletTransaction: { create: walletCreate } }),
    ),
  };

  let signedPayload: any = null;
  const jwt: any = {
    signAsync: vi.fn().mockImplementation(async (payload: any) => {
      if (payload?.purpose === 'oauth_onboarding') {
        signedPayload = payload;
        return 'onboarding-jwt-token';
      }
      return 'token-123';
    }),
    verifyAsync: vi.fn().mockImplementation(async (token: string) => {
      if (token === 'onboarding-jwt-token' && signedPayload) return signedPayload;
      throw new Error('invalid token');
    }),
  };

  return {
    service: new AuthService(prisma, jwt, {} as any),
    prisma,
    jwt,
    userCreate,
    userUpdate,
    walletCreate,
  };
}

describe('AuthService OAuth (Google y Apple) y confirmación de @usuario', () => {
  it('usuario nuevo con Google devuelve NEEDS_PROFILE y al confirmar @usuario acredita 100 monedas', async () => {
    const { service, userCreate, walletCreate } = makeService();

    const step1 = await service.verifyOAuthToken({
      provider: 'GOOGLE',
      idToken: 'dev:GOOGLE:g-sub-1:guille@gmail.com:Guille K',
    });

    expect(step1).toMatchObject({
      status: 'NEEDS_PROFILE',
      onboardingToken: 'onboarding-jwt-token',
      provider: 'GOOGLE',
      email: 'guille@gmail.com',
      suggestedDisplayName: 'Guille K',
      suggestedUsername: 'guille_k',
    });

    const step2 = await service.completeOAuthProfile({
      onboardingToken: 'onboarding-jwt-token',
      displayName: 'Guille K',
      username: '@Guille_K',
      inviteCode: 'INV123',
    });

    expect(step2.accessToken).toBe('token-123');
    expect(step2.user).toMatchObject({
      id: 'u-1',
      displayName: 'Guille K',
      username: 'guille_k',
      email: 'guille@gmail.com',
      coinsAvailable: BONUS_INIT_COINS,
    });
    expect(BONUS_INIT_COINS).toBe(100);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        displayName: 'Guille K',
        username: 'guille_k',
        email: 'guille@gmail.com',
        googleSub: 'g-sub-1',
        coinsAvailable: 100,
        invitedById: 'u-inviter',
      },
    });
    expect(walletCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        currency: 'COINS',
        type: 'BONUS_INIT',
        amount: 100,
        idempotencyKey: 'bonus_init:u-1',
      },
    });
  });

  it('usuario existente que ingresa con Apple recibe AUTHENTICATED directamente sin pedir @usuario', async () => {
    const { service, userCreate } = makeService({
      existingUsers: [
        {
          id: 'u-existing',
          displayName: 'Martín',
          username: 'martin_ok',
          email: 'martin@icloud.com',
          appleSub: 'apple-sub-99',
          coinsAvailable: 240,
        },
      ],
    });

    const res = await service.verifyOAuthToken({
      provider: 'APPLE',
      idToken: 'dev:APPLE:apple-sub-99:martin@icloud.com:Martín',
    });

    expect(res).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'token-123',
      user: {
        id: 'u-existing',
        username: 'martin_ok',
        coinsAvailable: 240,
      },
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rechaza un @usuario ocupado al confirmar perfil OAuth con 409 y sugerencias', async () => {
    const { service, userCreate } = makeService({ takenUsernames: ['martinko'] });

    await service.verifyOAuthToken({
      provider: 'GOOGLE',
      idToken: 'dev:GOOGLE:g-2:otro@gmail.com:Otro',
    });

    const err: any = await service
      .completeOAuthProfile({
        onboardingToken: 'onboarding-jwt-token',
        displayName: 'Otro',
        username: '@MartinKo',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().message).toContain('martinko');
    expect(err.getResponse().suggestions.length).toBeGreaterThan(0);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rechaza onboardingToken vencido o inválido', async () => {
    const { service } = makeService();
    await expect(
      service.completeOAuthProfile({
        onboardingToken: 'token-invalido',
        displayName: 'Ana',
        username: 'ana_01',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza proveedor inválido o token vacío en verifyOAuthToken', async () => {
    const { service } = makeService();
    await expect(
      service.verifyOAuthToken({ provider: 'OTRO' as any, idToken: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.verifyOAuthToken({ provider: 'GOOGLE', idToken: '   ' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
