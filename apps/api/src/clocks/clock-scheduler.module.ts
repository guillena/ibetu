import { Global, Module } from '@nestjs/common';
import { BullClockScheduler, CLOCK_SCHEDULER } from './clock-scheduler.js';

/** Cola de relojes (solo agendado, sin dependencias de dominio para evitar ciclos). */
@Global()
@Module({
  providers: [{ provide: CLOCK_SCHEDULER, useFactory: () => new BullClockScheduler() }],
  exports: [CLOCK_SCHEDULER],
})
export class ClockSchedulerModule {}

