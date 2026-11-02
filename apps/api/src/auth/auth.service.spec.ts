import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService, BONUS_INIT_COINS } from './auth.service.js';

function makeService(opts: { takenUsernames?: string[]; failCreateWithP2002?: boolean } = {}) {
  const taken = new Set(opts.takenUsernames ?? []);
  const walletCreate = vi.fn().mockResolvedValue({});
  const userCreate = vi.fn().mockImplementation(async ({ data }: any) => {
    if (opts.failCreateWithP2002) throw Object.assign(new Error('dup'), { code: 'P2002' });
    return { id: 'u-1', ...data };
  });
  const prisma: any = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
        taken.has(where.username) ? { id: 'x', username: where.username } : null,
      ),
    },
    $transaction: vi.fn().mockImplementation(async (fn: any) =>
      fn({ user: { create: userCreate }, walletTransaction: { create: walletCreate } }),
    ),
  };
  const jwt: any = { signAsync: vi.fn().mockResolvedValue('token-123') };
  return { service: new AuthService(prisma, jwt, {} as any), prisma, jwt, userCreate, walletCreate };
}

describe('AuthService.instantRegister', () => {
  it('crea la cuenta, emite sesión y acredita 50 monedas con clave idempotente', async () => {
    const { service, userCreate, walletCreate, jwt } = makeService();
    const res = await service.instantRegister({ displayName: ' Guille ', username: '@Guille_K' });

    expect(res.accessToken).toBe('token-123');
    expect(res.user).toMatchObject({
      displayName: 'Guille',
      username: 'guille_k',
      coinsAvailable: BONUS_INIT_COINS,
      whatsappLinked: false,
    });
    expect(userCreate).toHaveBeenCalledWith({
      data: { displayName: 'Guille', username: 'guille_k', coinsAvailable: 50 },
    });
    expect(walletCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        currency: 'COINS',
        type: 'BONUS_INIT',
        amount: 50,
        idempotencyKey: 'bonus_init:u-1',
      },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u-1', username: 'guille_k' });
  });

  it('rechaza un @usuario duplicado con 409 y sugerencias, sin crear nada', async () => {
    const { service, userCreate, walletCreate } = makeService({ takenUsernames: ['martinko'] });
    const err: any = await service
      .instantRegister({ displayName: 'Otro', username: '@MartinKo' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().message).toContain('martinko');
    expect(err.getResponse().suggestions.length).toBeGreaterThan(0);
    expect(userCreate).not.toHaveBeenCalled();
    expect(walletCreate).not.toHaveBeenCalled();
  });

  it('rechaza duplicado detectado en carrera (P2002 al crear)', async () => {
    const { service } = makeService({ failCreateWithP2002: true });
    await expect(
      service.instantRegister({ displayName: 'Ana', username: 'ana_01' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([['ab'], ['con espacios'], ['mayus!'], ['a'.repeat(21)]])(
    'rechaza @usuario inválido: %s',
    async (username) => {
      const { service } = makeService();
      await expect(
        service.instantRegister({ displayName: 'Ana', username }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rechaza nombre vacío', async () => {
    const { service } = makeService();
    await expect(
      service.instantRegister({ displayName: '   ', username: 'ana_01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('devuelve la URL pública de login por WhatsApp con el mensaje que dispara "entrar"', () => {
    const { service } = makeService();
    const res = service.getWhatsappLoginUrl();
    expect(res.messageText).toBe('Quiero entrar a mi cuenta IBetU');
    expect(res.whatsappUrl).toContain('https://wa.me/');
    expect(decodeURIComponent(res.whatsappUrl)).toContain('Quiero entrar a mi cuenta IBetU');
  });

  it('magicLogin incluye whatsappLinked: true cuando el usuario tiene whatsappPhone', async () => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-wsp',
          displayName: 'Guille',
          username: 'guille_k',
          coinsAvailable: 100,
          whatsappPhone: '5491112345678',
        }),
      },
    };
    const jwt: any = { signAsync: vi.fn().mockResolvedValue('jwt-magic') };
    const redis: any = { getdel: vi.fn().mockResolvedValue('u-wsp') };
    const service = new AuthService(prisma, jwt, redis);

    const res = await service.magicLogin('tok-valido');
    expect(res.accessToken).toBe('jwt-magic');
    expect(res.user.whatsappLinked).toBe(true);
  });
});

