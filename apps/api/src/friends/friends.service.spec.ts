import { FriendsService, REFERRAL_COINS } from './friends.service.js';

describe('FriendsService.tryGrantReferral (identidad OAuth Google/Apple)', () => {
  it('acredita +30 monedas al invitador cuando el invitado tiene googleSub/appleSub y activó su primer reto', async () => {
    const walletCreate = vi.fn().mockResolvedValue({});
    const userUpdate = vi.fn().mockResolvedValue({});
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-invitee',
          invitedById: 'u-inviter',
          googleSub: 'google-sub-123',
          email: 'invitee@gmail.com',
        }),
      },
      challenge: {
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn().mockImplementation(async (fn: any) =>
        fn({
          walletTransaction: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: walletCreate,
          },
          user: { update: userUpdate },
        }),
      ),
    };

    const service = new FriendsService(prisma);
    const granted = await service.tryGrantReferral('u-invitee');

    expect(granted).toBe(true);
    expect(walletCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u-inviter',
        currency: 'COINS',
        type: 'REFERRAL',
        amount: REFERRAL_COINS,
        idempotencyKey: 'referral:u-inviter:u-invitee',
      },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u-inviter' },
      data: { coinsAvailable: { increment: REFERRAL_COINS } },
    });
  });

  it('no acredita el premio si el invitado aún no tiene identidad verificada ni retos activos', async () => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u-invitee',
          invitedById: 'u-inviter',
          googleSub: null,
          appleSub: null,
          email: null,
          whatsappPhone: null,
        }),
      },
      challenge: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    const service = new FriendsService(prisma);
    expect(await service.tryGrantReferral('u-invitee')).toBe(false);
  });
});

