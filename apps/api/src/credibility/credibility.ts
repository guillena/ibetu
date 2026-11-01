import type { CredibilityEventType } from '@prisma/client';

/**
 * Termómetro de Credibilidad (% Fair Play).
 *
 *   Fair Play = round( 100 * L / (L + PESO_INCUMPLIMIENTO * F) )
 *
 *   L = acuerdos limpios (retos cerrados de común acuerdo, sin disputa; ganes o pierdas)
 *   F = incumplimientos comprobados (disputa perdida ante el Juez con una victoria declarada,
 *       o pago incumplido en modo Plata)
 *
 * Perder un reto, el silencio de 24 h o una disputa resuelta por rectificación no cambian
 * ni L ni F. Es una razón recalculable desde los asientos, así que nunca se desincroniza.
 */
export const FAULT_WEIGHT = 5;
/** A partir de este puntaje es "confiable" (verde). */
export const GREEN_MIN = 80;
/** A partir de este puntaje es "precaución" (amarillo); por debajo es "conflictivo" (rojo). */
export const YELLOW_MIN = 50;
/** Con menos hechos que esto el puntaje es provisional: todavía no hay historial suficiente. */
export const PROVISIONAL_BELOW = 3;

export type CredibilityBand = 'GREEN' | 'YELLOW' | 'RED';

export function computeScore(clean: number, faults: number): number {
  if (clean < 0 || faults < 0) throw new RangeError('Los contadores no pueden ser negativos.');
  if (clean + faults === 0) return 100; // sin historial: empieza completo
  return Math.round((100 * clean) / (clean + FAULT_WEIGHT * faults));
}

export function bandOf(score: number): CredibilityBand {
  if (score >= GREEN_MIN) return 'GREEN';
  if (score >= YELLOW_MIN) return 'YELLOW';
  return 'RED';
}

export interface CredibilityView {
  /** % Fair Play (0–100). */
  score: number;
  band: CredibilityBand;
  /** true mientras haya poco historial para que el puntaje sea representativo. */
  provisional: boolean;
  cleanAgreements: number;
  disputesLost: number;
  paymentDefaults: number;
  totalPlayed: number;
  totalWins: number;
}

export function buildView(u: {
  cleanClosedCount: number;
  disputeLostCount: number;
  paymentDefaultCount: number;
  totalPlayed: number;
  totalWins: number;
}): CredibilityView {
  const faults = u.disputeLostCount + u.paymentDefaultCount;
  const score = computeScore(u.cleanClosedCount, faults);
  return {
    score,
    band: bandOf(score),
    provisional: u.cleanClosedCount + faults < PROVISIONAL_BELOW,
    cleanAgreements: u.cleanClosedCount,
    disputesLost: u.disputeLostCount,
    paymentDefaults: u.paymentDefaultCount,
    totalPlayed: u.totalPlayed,
    totalWins: u.totalWins,
  };
}

/** Contador de `User` que mueve cada tipo de hecho. */
export const COUNTER_BY_TYPE = {
  CLEAN_AGREEMENT: 'cleanClosedCount',
  DISPUTE_LOST: 'disputeLostCount',
  PAYMENT_DEFAULT: 'paymentDefaultCount',
} as const satisfies Record<CredibilityEventType, string>;

export function credibilityKey(type: CredibilityEventType, challengeId: string, userId: string): string {
  return `cred:${type}:${challengeId}:${userId}`;
}

