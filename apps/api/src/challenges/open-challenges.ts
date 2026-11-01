import type { Challenge, ChallengeMode, ChallengeStatus, Vote } from '@prisma/client';
import { SILENCE_WINDOW_MS } from './results.service.js';
import { JUDGE_WINDOW_MS } from '../wallet/wallet.service.js';

/**
 * Pestañas de la pantalla "Retos":
 *  - IN_PLAY             "En Juego": retos aceptados que se están jugando.
 *  - TO_DECLARE          "Por Declarar": esperando declaración, en disputa o esperando el fallo del Juez.
 *  - INVITATION_RECEIVED "Invitaciones": retos que me mandaron y puedo aceptar o rechazar.
 *  - INVITATION_SENT     "Invitaciones": retos que mandé y esperan respuesta.
 */
export type OpenTab = 'IN_PLAY' | 'TO_DECLARE' | 'INVITATION_RECEIVED' | 'INVITATION_SENT';
export type OpenRole = 'CREATOR' | 'OPPONENT' | 'JUDGE';

export const OPEN_STATUSES: ChallengeStatus[] = ['PENDING', 'ACTIVE', 'RESULT', 'DISPUTE'];
const TAB_ORDER: OpenTab[] = ['IN_PLAY', 'TO_DECLARE', 'INVITATION_RECEIVED', 'INVITATION_SENT'];

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export type OpenChallengeRow = Challenge & {
  creator: PublicUser;
  opponent: PublicUser | null;
};

export interface OpenChallengeItem {
  id: string;
  inviteCode: string;
  title: string;
  mode: ChallengeMode;
  stakeAmount: number;
  status: ChallengeStatus;
  tab: OpenTab;
  role: OpenRole;
  /** El otro jugador (para el Juez es null: ver `players`). */
  rival: PublicUser | null;
  /** Los dos jugadores; si falta el rival (reto abierto por link) solo viene el creador. */
  players: PublicUser[];
  createdAt: Date;
  expiresAt: Date;
  /** Pozo total en monedas (stake × 2); null en modo Plata. */
  pot: number | null;
  /** ¿El usuario tiene algo para hacer ahora? (declarar, aprobar, aceptar, fallar). */
  actionNeeded: boolean;
  myVote: Vote | null;
  rivalHasVoted: boolean;
  /** Solo visible cuando ambos votaron (no se revela el voto del rival antes). */
  rivalVote: Vote | null;
  /** Con una única declaración: cuándo vence el plazo de silencio de 24 h. */
  silenceDeadline: Date | null;
  /** En disputa: estado de la designación del Juez. */
  judge: { proposed: boolean; assigned: boolean; verdictDeadline: Date | null } | null;
  /** Enlace para compartir por WhatsApp (solo en retos pendientes que creé yo). */
  shareUrl: string | null;
}

export interface OpenChallengeCounts {
  inPlay: number;
  toDeclare: number;
  /** De los "Por Declarar", cuántos requieren una acción del usuario (alerta en la pestaña). */
  toDeclareActionNeeded: number;
  invitationsReceived: number;
  invitationsSent: number;
}

export interface OpenChallengeList {
  items: OpenChallengeItem[];
  counts: OpenChallengeCounts;
}

/** Rol del usuario en el reto, o null si no participa. */
export function roleOf(c: Pick<Challenge, 'creatorId' | 'opponentId' | 'judgeId' | 'judgeAssignedAt'>, userId: string): OpenRole | null {
  if (c.creatorId === userId) return 'CREATOR';
  if (c.opponentId === userId) return 'OPPONENT';
  if (c.judgeId === userId && c.judgeAssignedAt) return 'JUDGE';
  return null;
}

/**
 * Pestaña de un reto para un usuario, o null si no corresponde mostrarlo
 * (reto cerrado o cancelado, o el usuario no participa).
 */
export function classify(c: OpenChallengeRow, userId: string): { tab: OpenTab; role: OpenRole } | null {
  const role = roleOf(c, userId);
  if (!role) return null;

  switch (c.status) {
    case 'ACTIVE':
      return role === 'JUDGE' ? null : { tab: 'IN_PLAY', role };
    case 'RESULT':
      return role === 'JUDGE' ? null : { tab: 'TO_DECLARE', role };
    case 'DISPUTE':
      return { tab: 'TO_DECLARE', role };
    case 'PENDING':
      if (role === 'OPPONENT') return { tab: 'INVITATION_RECEIVED', role };
      if (role === 'CREATOR') return { tab: 'INVITATION_SENT', role };
      return null;
    default:
      return null; // CLOSED / CANCELLED
  }
}

/** ¿Hay algo que el usuario deba hacer ahora en este reto? */
export function needsAction(c: OpenChallengeRow, role: OpenRole): boolean {
  switch (c.status) {
    case 'PENDING':
      return role === 'OPPONENT'; // aceptar o rechazar
    case 'RESULT': {
      const mine = role === 'CREATOR' ? c.creatorVote : c.opponentVote;
      return mine === null; // todavía no declaró
    }
    case 'DISPUTE': {
      if (role === 'JUDGE') return true; // le toca fallar
      if (c.judgeAssignedAt) return false; // ya hay Juez: se espera su fallo
      if (c.judgeProposedById) return c.judgeProposedById !== (role === 'CREATOR' ? c.creatorId : c.opponentId);
      return true; // sin propuesta: cualquiera puede rectificar o proponer un Juez
    }
    default:
      return false;
  }
}

export function toItem(c: OpenChallengeRow, userId: string, appUrl: string): OpenChallengeItem | null {
  const cls = classify(c, userId);
  if (!cls) return null;
  const { tab, role } = cls;

  const isCreator = role === 'CREATOR';
  const mine = role === 'JUDGE' ? null : isCreator ? c.creatorVote : c.opponentVote;
  const theirs = role === 'JUDGE' ? null : isCreator ? c.opponentVote : c.creatorVote;
  const bothVoted = c.creatorVote !== null && c.opponentVote !== null;
  const players = [c.creator, ...(c.opponent ? [c.opponent] : [])];
  const rival = role === 'JUDGE' ? null : isCreator ? c.opponent : c.creator;
  const oneVote = Number(c.creatorVote !== null) + Number(c.opponentVote !== null) === 1;

  return {
    id: c.id,
    inviteCode: c.inviteCode,
    title: c.title,
    mode: c.mode,
    stakeAmount: c.stakeAmount,
    status: c.status,
    tab,
    role,
    rival,
    players,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    pot: c.mode === 'COINS' ? c.stakeAmount * 2 : null,
    actionNeeded: needsAction(c, role),
    myVote: mine,
    rivalHasVoted: theirs !== null,
    rivalVote: bothVoted ? theirs : null,
    silenceDeadline:
      c.status === 'RESULT' && oneVote && c.firstDeclaredAt
        ? new Date(c.firstDeclaredAt.getTime() + SILENCE_WINDOW_MS)
        : null,
    judge:
      c.status === 'DISPUTE'
        ? {
            proposed: c.judgeId !== null,
            assigned: c.judgeAssignedAt !== null,
            verdictDeadline: c.judgeAssignedAt ? new Date(c.judgeAssignedAt.getTime() + JUDGE_WINDOW_MS) : null,
          }
        : null,
    shareUrl: c.status === 'PENDING' && role === 'CREATOR' ? `${appUrl}/r/${c.inviteCode}` : null,
  };
}

/** Fecha que más urge en el reto: la que primero vence. */
function urgency(i: OpenChallengeItem): number {
  return (i.silenceDeadline ?? i.judge?.verdictDeadline ?? i.expiresAt).getTime();
}

/**
 * Orden: primero por pestaña; dentro de cada una, lo más urgente arriba
 * (En Juego y Por Declarar por vencimiento más próximo; Por Declarar con acción pendiente primero;
 * invitaciones, las más nuevas primero).
 */
export function sortItems(items: OpenChallengeItem[]): OpenChallengeItem[] {
  return [...items].sort((a, b) => {
    const byTab = TAB_ORDER.indexOf(a.tab) - TAB_ORDER.indexOf(b.tab);
    if (byTab !== 0) return byTab;
    if (a.tab === 'INVITATION_RECEIVED' || a.tab === 'INVITATION_SENT') {
      return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
    }
    if (a.tab === 'TO_DECLARE' && a.actionNeeded !== b.actionNeeded) return a.actionNeeded ? -1 : 1;
    return urgency(a) - urgency(b) || (a.id < b.id ? -1 : 1);
  });
}

export function countItems(items: OpenChallengeItem[]): OpenChallengeCounts {
  const inTab = (t: OpenTab) => items.filter((i) => i.tab === t);
  return {
    inPlay: inTab('IN_PLAY').length,
    toDeclare: inTab('TO_DECLARE').length,
    toDeclareActionNeeded: inTab('TO_DECLARE').filter((i) => i.actionNeeded).length,
    invitationsReceived: inTab('INVITATION_RECEIVED').length,
    invitationsSent: inTab('INVITATION_SENT').length,
  };
}

