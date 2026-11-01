import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/** Pequeño wrapper sobre ioredis para tokens efímeros (vinculación, magic link). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    { lazyConnect: false, maxRetriesPerRequest: 2 },
  );

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Lee y borra de forma atómica: garantiza uso único del token. */
  async getdel(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}

