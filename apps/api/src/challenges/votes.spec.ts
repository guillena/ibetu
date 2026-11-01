import { evaluateVotes } from './votes.js';
import type { Vote } from '@prisma/client';

describe('evaluateVotes – tabla completa de combinaciones (unitario)', () => {
  const W: Vote = 'WIN';
  const L: Vote = 'LOSS';
  const D: Vote = 'DRAW';

  it('espera mientras falte algún voto', () => {
    expect(evaluateVotes(null, null)).toEqual({ kind: 'WAITING' });
    expect(evaluateVotes(W, null)).toEqual({ kind: 'WAITING' });
    expect(evaluateVotes(null, L)).toEqual({ kind: 'WAITING' });
    expect(evaluateVotes(D, null)).toEqual({ kind: 'WAITING' });
  });

  it('coinciden en el ganador: gana quien dijo "gané"', () => {
    expect(evaluateVotes(W, L)).toEqual({ kind: 'WIN', winner: 'CREATOR' });
    expect(evaluateVotes(L, W)).toEqual({ kind: 'WIN', winner: 'OPPONENT' });
  });

  it('ambos empate: se devuelve el pozo', () => {
    expect(evaluateVotes(D, D)).toEqual({ kind: 'DRAW' });
  });

  it('ambos dicen "ganó mi rival": nadie reclama el premio, se devuelve el pozo', () => {
    expect(evaluateVotes(L, L)).toEqual({ kind: 'DRAW' });
  });

  it('ambos dicen "gané yo": disputa', () => {
    expect(evaluateVotes(W, W)).toEqual({ kind: 'DISPUTE' });
  });

  it('empate contra victoria o derrota: declaraciones contradictorias, disputa', () => {
    expect(evaluateVotes(W, D)).toEqual({ kind: 'DISPUTE' });
    expect(evaluateVotes(D, W)).toEqual({ kind: 'DISPUTE' });
    expect(evaluateVotes(L, D)).toEqual({ kind: 'DISPUTE' });
    expect(evaluateVotes(D, L)).toEqual({ kind: 'DISPUTE' });
  });

  it('cubre las 9 combinaciones posibles sin dejar ninguna sin resolver', () => {
    const all: Vote[] = [W, L, D];
    for (const a of all) {
      for (const b of all) {
        expect(['WIN', 'DRAW', 'DISPUTE']).toContain(evaluateVotes(a, b).kind);
      }
    }
  });
});

