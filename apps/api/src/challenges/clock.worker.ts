import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { CLOCK_SCHEDULER, SWEEP_EVERY_MS, redisConnection } from '../clocks/clock-scheduler.js';
import type { ClockScheduler } from '../clocks/clock-scheduler.js';
import { ChallengeClocksService } from './clocks.service.js';

/** Proceso que ejecuta los trabajos diferidos y el barrido periódico. */
@Injectable()
export class ClockWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ClockWorker.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(ChallengeClocksService) private readonly clocks: ChallengeClocksService,
    @Optional() @Inject(CLOCK_SCHEDULER) private readonly scheduler?: ClockScheduler,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.CLOCKS_ENABLED === 'false' || !this.scheduler) return;
    await this.start();
  }

  /**
   * Arranca el worker sobre la cola del agendador. `registerSweep` registra además el
   * barrido periódico (se desactiva en pruebas para no tocar datos ajenos).
   */
  async start(sweepEveryMs: number = SWEEP_EVERY_MS, registerSweep = true) {
    if (this.worker || !this.scheduler) return;
    this.worker = new Worker(this.scheduler.queueName, (job) => this.process(job), {
      connection: redisConnection(true),
      concurrency: 5,
    });
    this.worker.on('error', (err) => this.logger.error(err.message));
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Reloj ${job?.name} (${job?.id}) falló: ${err.message}`),
    );
    if (registerSweep) await this.scheduler.registerSweeper(sweepEveryMs);
    this.logger.log(`Worker de relojes activo en la cola "${this.scheduler.queueName}".`);
  }

  async process(job: Job): Promise<void> {
    const now = new Date();
    const id: string | undefined = job.data?.challengeId;
    switch (job.name) {
      case 'expire':
        if (id) await this.clocks.expireChallenge(id, now);
        break;
      case 'silence':
        if (id) await this.clocks.adjudicateSilence(id, now);
        break;
      case 'judge':
        if (id) await this.clocks.revokeExpiredJudge(id, now);
        break;
      case 'sweep': {
        const r = await this.clocks.sweepOverdue(now);
        if (r.expired + r.silenced + r.judgesRevoked + r.failed > 0) {
          this.logger.log(`Barrido: ${JSON.stringify(r)}`);
        }
        break;
      }
      default:
        this.logger.warn(`Trabajo desconocido: ${job.name}`);
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  async stop() {
    await this.worker?.close();
    this.worker = null;
  }
}
