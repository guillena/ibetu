import type { Vote } from '@prisma/client';

export type Side = 'CREATOR' | 'OPPONENT';

export type Resolution =
  | { kind: 'WAITING' }
  | { kind: 'WIN'; winner: Side }
  | { kind: 'DRAW' }
  | { kind: 'DISPUTE' };

/**
 * Evalúa las declaraciones de ambos jugadores. Cada voto es desde la perspectiva de
 * quien lo emite: WIN = "gané yo", LOSS = "ganó mi rival", DRAW = "empate / cancelar".
 *
 *  - Falta algún voto                      -> WAITING
 *  - Uno dice "gané" y el otro "perdí"      -> gana el que dijo "gané"
 *  - Ambos dicen DRAW                       -> DRAW (se devuelve el pozo)
 *  - Ambos dicen "ganó mi rival" (LOSS)     -> DRAW: nadie reclama el premio, se devuelve
 *  - Cualquier otra combinación             -> DISPUTE (declaraciones contradictorias)
 */
export function evaluateVotes(creator: Vote | null, opponent: Vote | null): Resolution {
  if (!creator || !opponent) return { kind: 'WAITING' };
  if (creator === 'WIN' && opponent === 'LOSS') return { kind: 'WIN', winner: 'CREATOR' };
  if (creator === 'LOSS' && opponent === 'WIN') return { kind: 'WIN', winner: 'OPPONENT' };
  if (creator === 'DRAW' && opponent === 'DRAW') return { kind: 'DRAW' };
  if (creator === 'LOSS' && opponent === 'LOSS') return { kind: 'DRAW' };
  return { kind: 'DISPUTE' };
}

