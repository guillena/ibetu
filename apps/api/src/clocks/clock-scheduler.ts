import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { ConnectionOptions, Job } from 'bullmq';

export const CLOCK_SCHEDULER = Symbol('CLOCK_SCHEDULER');

export const SWEEP_EVERY_MS = 60_000;

/** Tipos de reloj. Cada uno es un trabajo diferido con ID determinístico por reto. */
export type ClockKind = 'expire' | 'silence' | 'judge';

const JOB_PREFIX: Record<ClockKind, string> = {
  // BullMQ no admite ":" en IDs personalizados, por eso el separador es "__".
  expire: 'challenge-expire',
  silence: 'declare-timeout-24h',
  judge: 'judge-timeout-48h',
};

/** ID determinístico: permite reemplazar o cancelar el reloj de un reto sin buscarlo. */
export function clockJobId(kind: ClockKind, challengeId: string): string {
  return `${JOB_PREFIX[kind]}__${challengeId}`;
}

/** Contrato de agendado de relojes (lo usan los servicios de dominio). */
export interface ClockScheduler {
  readonly queueName: string;
  /** Vencimiento del reto: si nadie declaró, se cancela y se devuelve. */
  scheduleExpire(challengeId: string, at: Date): Promise<void>;
  /** 24 h desde la primera declaración: si el rival calla, se adjudica. */
  scheduleSilence(challengeId: string, at: Date): Promise<void>;
  /** 48 h del Juez: si no falla, se revoca su asignación. */
  scheduleJudge(challengeId: string, at: Date): Promise<void>;
  cancelExpire(challengeId: string): Promise<void>;
  cancelSilence(challengeId: string): Promise<void>;
  cancelJudge(challengeId: string): Promise<void>;
  cancelAll(challengeId: string): Promise<void>;
  /** Barrido periódico que re-ejecuta lo vencido (red de seguridad ante Redis caído). */
  registerSweeper(everyMs?: number): Promise<void>;
}

/** Opciones de conexión a Redis a partir de REDIS_URL. */
export function redisConnection(forWorker = false): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Los Worker de BullMQ exigen reintentos ilimitados en su conexión bloqueante.
    ...(forWorker ? { maxRetriesPerRequest: null } : {}),
  };
}

export function defaultQueueName(): string {
  return process.env.CLOCK_QUEUE_NAME ?? 'challenge-clocks';
}

/**
 * Ejecuta un efecto sobre los relojes sin permitir que su falla rompa la acción del usuario:
 * la acción ya se confirmó en la base, y el barrido periódico corrige cualquier reloj perdido.
 */
export async function runClock(
  clocks: ClockScheduler | undefined,
  logger: Logger,
  fn: (c: ClockScheduler) => Promise<void>,
): Promise<void> {
  if (!clocks) return;
  try {
    await fn(clocks);
  } catch (err) {
    logger.error('No se pudo actualizar un reloj; el barrido periódico lo corregirá.', err as Error);
  }
}

export class BullClockScheduler implements ClockScheduler, OnModuleDestroy {
  readonly queueName: string;
  readonly queue: Queue;

  constructor(options: { queueName?: string } = {}) {
    this.queueName = options.queueName ?? defaultQueueName();
    this.queue = new Queue(this.queueName, {
      connection: redisConnection(),
      defaultJobOptions: {
        removeOnComplete: true, // libera el ID para poder reagendar
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    });
    // Evita que un error de conexión de Redis tire el proceso entero.
    this.queue.on('error', (err) => new Logger('ClockQueue').error(err.message));
  }

  scheduleExpire(challengeId: string, at: Date) {
    return this.schedule('expire', challengeId, at);
  }
  scheduleSilence(challengeId: string, at: Date) {
    return this.schedule('silence', challengeId, at);
  }
  scheduleJudge(challengeId: string, at: Date) {
    return this.schedule('judge', challengeId, at);
  }
  cancelExpire(challengeId: string) {
    return this.cancel('expire', challengeId);
  }
  cancelSilence(challengeId: string) {
    return this.cancel('silence', challengeId);
  }
  cancelJudge(challengeId: string) {
    return this.cancel('judge', challengeId);
  }
  async cancelAll(challengeId: string) {
    await Promise.all([
      this.cancel('expire', challengeId),
      this.cancel('silence', challengeId),
      this.cancel('judge', challengeId),
    ]);
  }

  async registerSweeper(everyMs: number = SWEEP_EVERY_MS) {
    await this.queue.upsertJobScheduler('sweep', { every: everyMs }, { name: 'sweep', data: {} });
  }

  /** El trabajo pendiente de un reloj, si existe (útil para diagnóstico y tests). */
  getJob(kind: ClockKind, challengeId: string): Promise<Job | undefined> {
    return this.queue.getJob(clockJobId(kind, challengeId));
  }

  async onModuleDestroy() {
    await this.close();
  }

  async close() {
    await this.queue.close();
  }

  private async schedule(kind: ClockKind, challengeId: string, at: Date) {
    const jobId = clockJobId(kind, challengeId);
    const delay = Math.max(0, at.getTime() - Date.now());
    // Un ID repetido se ignora en BullMQ: se elimina el anterior para reemplazarlo.
    await this.queue.remove(jobId);
    await this.queue.add(kind, { challengeId }, { jobId, delay });
  }

  private async cancel(kind: ClockKind, challengeId: string) {
    await this.queue.remove(clockJobId(kind, challengeId));
  }
}

