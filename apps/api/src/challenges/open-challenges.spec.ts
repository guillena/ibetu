import type { ChallengeStatus, Vote } from '@prisma/client';
import { JUDGE_WINDOW_MS } from '../wallet/wallet.service.js';
import {
  classify,
  countItems,
  needsAction,
  roleOf,
  sortItems,
  toItem,
} from './open-challenges.js';
import type { OpenChallengeItem, OpenChallengeRow, OpenTab } from './open-challenges.js';
import { SILENCE_WINDOW_MS } from './results.service.js';

const ME = 'user-me';
const RIVAL = 'user-rival';
const OTHER = 'user-other';
const T0 = new Date('2026-11-01T12:00:00-03:00');
const HOUR = 3_600_000;

const user = (id: string) => ({ id, username: `@${id}`, displayName: id.toUpperCase() });

/** Fila de reto con valores por defecto: yo soy el creador y mi rival el invitado. */
function row(over: Partial<OpenChallengeRow> = {}): OpenChallengeRow {
  return {
    id: 'c1',
    inviteCode: 'CODE123456',
    title: '¿A que no embocás el papel en el cesto?',
    creatorId: ME,
    opponentId: RIVAL,
    judgeId: null,
    judgeProposedById: null,
    judgeApprovedByCreator: false,
    judgeApprovedByOpponent: false,
    mode: 'COINS',
    stakeAmount: 10,
    status: 'ACTIVE',
    expiresAt: new Date(T0.getTime() + 24 * HOUR),
    firstDeclaredAt: null,
    judgeAssignedAt: null,
    creatorVote: null,
    opponentVote: null,
    winnerId: null,
    cashPaymentStatus: 'NOT_APPLICABLE',
    createdAt: T0,
    closedAt: null,
    creator: user(ME),
    opponent: user(RIVAL),
    ...over,
  } as OpenChallengeRow;
}
/** El mismo reto visto desde el lado del invitado (yo soy el oponente). */
const asOpponent = (over: Partial<OpenChallengeRow> = {}) =>
  row({ creatorId: RIVAL, opponentId: ME, creator: user(RIVAL), opponent: user(ME), ...over });

const tabOf = (r: OpenChallengeRow, u = ME) => classify(r, u)?.tab ?? null;

describe('Retos abiertos – clasificación por estado (unitarios)', () => {
  describe('qué pestaña le corresponde a cada estado', () => {
    const cases: Array<[ChallengeStatus, OpenTab | null]> = [
      ['PENDING', 'INVITATION_SENT'], // yo creé el reto y espera respuesta
      ['ACTIVE', 'IN_PLAY'],
      ['RESULT', 'TO_DECLARE'],
      ['DISPUTE', 'TO_DECLARE'],
      ['CLOSED', null], // van al historial
      ['CANCELLED', null],
    ];
    it.each(cases)('creador: %s -> %s', (status, tab) => {
      expect(tabOf(row({ status }))).toBe(tab);
    });

    it('invitado: un reto pendiente es una invitación RECIBIDA; el resto va igual que al creador', () => {
      expect(tabOf(asOpponent({ status: 'PENDING' }))).toBe('INVITATION_RECEIVED');
      expect(tabOf(asOpponent({ status: 'ACTIVE' }))).toBe('IN_PLAY');
      expect(tabOf(asOpponent({ status: 'RESULT' }))).toBe('TO_DECLARE');
      expect(tabOf(asOpponent({ status: 'DISPUTE' }))).toBe('TO_DECLARE');
      expect(tabOf(asOpponent({ status: 'CLOSED' }))).toBeNull();
      expect(tabOf(asOpponent({ status: 'CANCELLED' }))).toBeNull();
    });

    it('un reto abierto por link (sin rival) que yo creé está en "invitación enviada"', () => {
      expect(tabOf(row({ status: 'PENDING', opponentId: null, opponent: null }))).toBe('INVITATION_SENT');
    });

    it('quien no participa no ve el reto, en ningún estado', () => {
      for (const status of ['PENDING', 'ACTIVE', 'RESULT', 'DISPUTE', 'CLOSED', 'CANCELLED'] as ChallengeStatus[]) {
        expect(tabOf(row({ status }), OTHER)).toBeNull();
      }
    });
  });

  describe('el Juez', () => {
    const judged = (over: Partial<OpenChallengeRow> = {}) =>
      row({ status: 'DISPUTE', judgeId: OTHER, judgeProposedById: ME, judgeAssignedAt: T0, ...over });

    it('el Juez asignado ve la disputa en "Por Declarar" con su fallo pendiente', () => {
      const r = judged();
      expect(roleOf(r, OTHER)).toBe('JUDGE');
      expect(classify(r, OTHER)).toEqual({ tab: 'TO_DECLARE', role: 'JUDGE' });
      expect(needsAction(r, 'JUDGE')).toBe(true);
    });

    it('un Juez solo propuesto (sin aprobación de ambos) no ve nada todavía', () => {
      expect(tabOf(judged({ judgeAssignedAt: null }), OTHER)).toBeNull();
    });

    it('el Juez no ve retos en otros estados (solo disputas)', () => {
      for (const status of ['ACTIVE', 'RESULT', 'PENDING', 'CLOSED'] as ChallengeStatus[]) {
        expect(tabOf(judged({ status }), OTHER)).toBeNull();
      }
    });
  });

  describe('cuándo se requiere una acción del usuario', () => {
    it('invitación recibida: sí (aceptar o rechazar); invitación enviada: no', () => {
      expect(needsAction(asOpponent({ status: 'PENDING' }), 'OPPONENT')).toBe(true);
      expect(needsAction(row({ status: 'PENDING' }), 'CREATOR')).toBe(false);
    });

    it('en juego: no (se está jugando)', () => {
      expect(needsAction(row({ status: 'ACTIVE' }), 'CREATOR')).toBe(false);
    });

    it('esperando declaración: sí solo para quien todavía no declaró', () => {
      const r = row({ status: 'RESULT', creatorVote: 'WIN' });
      expect(needsAction(r, 'CREATOR')).toBe(false); // yo ya declaré: espero a mi rival
      expect(needsAction(r, 'OPPONENT')).toBe(true); // mi rival sí tiene que declarar
    });

    it('disputa sin propuesta de Juez: ambos pueden actuar', () => {
      const r = row({ status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN' });
      expect(needsAction(r, 'CREATOR')).toBe(true);
      expect(needsAction(r, 'OPPONENT')).toBe(true);
    });

    it('disputa con un Juez propuesto: debe actuar el que tiene que aprobar, no el que propuso', () => {
      const r = row({ status: 'DISPUTE', judgeId: OTHER, judgeProposedById: ME });
      expect(needsAction(r, 'CREATOR')).toBe(false); // yo propuse: espero
      expect(needsAction(r, 'OPPONENT')).toBe(true); // el rival debe aprobar o contraproponer
    });

    it('disputa con Juez ya asignado: los jugadores esperan el fallo; el Juez debe actuar', () => {
      const r = row({ status: 'DISPUTE', judgeId: OTHER, judgeProposedById: ME, judgeAssignedAt: T0 });
      expect(needsAction(r, 'CREATOR')).toBe(false);
      expect(needsAction(r, 'OPPONENT')).toBe(false);
      expect(needsAction(r, 'JUDGE')).toBe(true);
    });
  });

  describe('contenido de cada item', () => {
    const item = (r: OpenChallengeRow, u = ME) => toItem(r, u, 'https://ibetu.app') as OpenChallengeItem;

    it('en monedas: pozo = 2 × apuesta; en Plata: sin pozo', () => {
      expect(item(row({ stakeAmount: 10 })).pot).toBe(20);
      expect(item(row({ mode: 'CASH', stakeAmount: 5000 })).pot).toBeNull();
    });

    it('rival: el otro jugador, según quién soy', () => {
      expect(item(row()).rival?.id).toBe(RIVAL);
      expect(item(asOpponent()).rival?.id).toBe(RIVAL);
      expect(item(row({ status: 'PENDING', opponentId: null, opponent: null })).rival).toBeNull();
    });

    it('jugadores: ambos, o solo el creador si todavía no hay rival', () => {
      expect(item(row()).players.map((p) => p.id)).toEqual([ME, RIVAL]);
      expect(item(row({ status: 'PENDING', opponentId: null, opponent: null })).players.map((p) => p.id)).toEqual([ME]);
    });

    it('el voto del rival no se revela hasta que ambos votaron', () => {
      const oneVote = item(row({ status: 'RESULT', creatorVote: 'WIN', firstDeclaredAt: T0 }), RIVAL);
      expect(oneVote).toMatchObject({ myVote: null, rivalHasVoted: true, rivalVote: null });

      const both = item(row({ status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN' }));
      expect(both).toMatchObject({ myVote: 'WIN' as Vote, rivalHasVoted: true, rivalVote: 'WIN' });
    });

    it('silencio de 24 h: solo con una única declaración', () => {
      const one = item(row({ status: 'RESULT', creatorVote: 'WIN', firstDeclaredAt: T0 }));
      expect(one.silenceDeadline?.getTime()).toBe(T0.getTime() + SILENCE_WINDOW_MS);
      expect(item(row({ status: 'ACTIVE' })).silenceDeadline).toBeNull();
      expect(item(row({ status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN', firstDeclaredAt: T0 })).silenceDeadline).toBeNull();
    });

    it('Juez: estado de la designación solo dentro de una disputa', () => {
      const proposed = item(row({ status: 'DISPUTE', judgeId: OTHER, judgeProposedById: ME }));
      expect(proposed.judge).toEqual({ proposed: true, assigned: false, verdictDeadline: null });
      const assigned = item(row({ status: 'DISPUTE', judgeId: OTHER, judgeAssignedAt: T0 }));
      expect(assigned.judge?.assigned).toBe(true);
      expect(assigned.judge?.verdictDeadline?.getTime()).toBe(T0.getTime() + JUDGE_WINDOW_MS);
      expect(item(row({ status: 'DISPUTE' })).judge).toEqual({ proposed: false, assigned: false, verdictDeadline: null });
      expect(item(row({ status: 'ACTIVE' })).judge).toBeNull();
    });

    it('enlace para compartir: solo en mis retos pendientes', () => {
      expect(item(row({ status: 'PENDING' })).shareUrl).toBe('https://ibetu.app/r/CODE123456');
      expect(item(asOpponent({ status: 'PENDING' })).shareUrl).toBeNull(); // me invitaron: no es mío para compartir
      expect(item(row({ status: 'ACTIVE' })).shareUrl).toBeNull();
    });

    it('devuelve null para lo que no se muestra', () => {
      expect(toItem(row({ status: 'CLOSED' }), ME, 'x')).toBeNull();
      expect(toItem(row(), OTHER, 'x')).toBeNull();
    });

    it('no expone niveles, rachas ni datos internos', () => {
      const keys = Object.keys(item(row())).map((k) => k.toLowerCase());
      for (const f of ['level', 'nivel', 'streak', 'racha', 'judgeapproved', 'creatorvote', 'opponentvote', 'winnerid']) {
        expect(keys.filter((k) => k.includes(f))).toEqual([]);
      }
    });
  });

  describe('orden y conteos', () => {
    const mk = (id: string, over: Partial<OpenChallengeRow>) => toItem(row({ id, ...over }), ME, 'x') as OpenChallengeItem;

    it('agrupa por pestaña en el orden En Juego, Por Declarar, Recibidas, Enviadas', () => {
      const items = sortItems([
        mk('e', { status: 'PENDING' }),
        mk('r', { ...asOpponent({ id: 'r', status: 'PENDING' }) }),
        mk('d', { status: 'DISPUTE' }),
        mk('a', { status: 'ACTIVE' }),
      ]);
      expect(items.map((i) => i.tab)).toEqual(['IN_PLAY', 'TO_DECLARE', 'INVITATION_RECEIVED', 'INVITATION_SENT']);
    });

    it('En Juego: el que vence antes va primero', () => {
      const items = sortItems([
        mk('tarde', { expiresAt: new Date(T0.getTime() + 48 * HOUR) }),
        mk('pronto', { expiresAt: new Date(T0.getTime() + 1 * HOUR) }),
        mk('medio', { expiresAt: new Date(T0.getTime() + 10 * HOUR) }),
      ]);
      expect(items.map((i) => i.id)).toEqual(['pronto', 'medio', 'tarde']);
    });

    it('Por Declarar: primero lo que requiere acción y, dentro de cada grupo, lo más urgente', () => {
      const items = sortItems([
        mk('espera-pronto', { status: 'RESULT', creatorVote: 'WIN', firstDeclaredAt: T0, expiresAt: new Date(T0.getTime() + HOUR) }),
        mk('accion-tarde', { status: 'RESULT', opponentVote: 'WIN', firstDeclaredAt: T0, expiresAt: new Date(T0.getTime() + 50 * HOUR) }),
        mk('accion-pronto', { status: 'DISPUTE', creatorVote: 'WIN', opponentVote: 'WIN', expiresAt: new Date(T0.getTime() + 2 * HOUR) }),
      ]);
      // Con acción pendiente primero (la disputa vence a las 2 h; la declaración, a las 24 h de silencio).
      expect(items.map((i) => i.id)).toEqual(['accion-pronto', 'accion-tarde', 'espera-pronto']);
      expect(items[0].actionNeeded).toBe(true);
      expect(items[1].actionNeeded).toBe(true);
      expect(items[2].actionNeeded).toBe(false);
    });

    it('Invitaciones: las más nuevas primero', () => {
      const items = sortItems([
        mk('vieja', { status: 'PENDING', createdAt: new Date(T0.getTime() - 5 * HOUR) }),
        mk('nueva', { status: 'PENDING', createdAt: new Date(T0.getTime() + 5 * HOUR) }),
      ]);
      expect(items.map((i) => i.id)).toEqual(['nueva', 'vieja']);
    });

    it('con fechas iguales el orden es estable (desempata por id)', () => {
      const a = sortItems([mk('b', {}), mk('a', {}), mk('c', {})]).map((i) => i.id);
      const b = sortItems([mk('c', {}), mk('b', {}), mk('a', {})]).map((i) => i.id);
      expect(a).toEqual(b);
    });

    it('los conteos coinciden con lo que se muestra en cada pestaña', () => {
      const items = [
        mk('1', { status: 'ACTIVE' }),
        mk('2', { status: 'ACTIVE' }),
        mk('3', { status: 'RESULT', opponentVote: 'WIN', firstDeclaredAt: T0 }), // me toca declarar
        mk('4', { status: 'RESULT', creatorVote: 'WIN', firstDeclaredAt: T0 }), // espero
        mk('5', { status: 'PENDING' }),
        toItem(asOpponent({ id: '6', status: 'PENDING' }), ME, 'x')!,
        toItem(asOpponent({ id: '7', status: 'PENDING' }), ME, 'x')!,
      ];
      expect(countItems(items)).toEqual({
        inPlay: 2, toDeclare: 2, toDeclareActionNeeded: 1, invitationsReceived: 2, invitationsSent: 1,
      });
      expect(countItems([])).toEqual({
        inPlay: 0, toDeclare: 0, toDeclareActionNeeded: 0, invitationsReceived: 0, invitationsSent: 0,
      });
    });
  });
});
