import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        `No se pudo conectar a PostgreSQL al iniciar (${err instanceof Error ? err.message : String(err)}). Se reintentará en cada consulta.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
