"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell } from "@/components/shell/shell-context";
import { formatRemaining } from "./RetosFeed";
import {
  ApiError,
  apiFetch,
  type CurrencyMode,
  type FairPlayBand,
  type FriendItem,
  type Vote,
} from "@/lib/api";

export interface ChallengeDetailPlayer {
  id: string;
  username: string;
  displayName: string;
  credibility: {
    score: number;
    band: FairPlayBand;
    provisional: boolean;
  };
}

export interface ChallengeTimelineEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChallengeEvidenceItem {
  key: string;
  kind: "VIDEO" | "IMAGE";
  contentType: string;
  sizeBytes: number;
  uploadedById: string | null;
  uploadedAt: string;
  url?: string;
}

export interface ChallengeDetailData {
  id: string;
  inviteCode: string;
  title: string;
  status: "PENDING" | "ACTIVE" | "RESULT" | "DISPUTE" | "CLOSED" | "CANCELLED";
  mode: CurrencyMode;
  stakeAmount: number;
  pot: number | null;
  role: "CREATOR" | "OPPONENT" | "JUDGE";
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  winnerId: string | null;
  shareUrl: string;
  whatsappShareUrl: string;
  creator: ChallengeDetailPlayer;
  opponent: ChallengeDetailPlayer | null;
  myVote: Vote | null;
  rivalHasVoted: boolean;
  rivalVote: Vote | null;
  creatorVote: Vote | null;
  opponentVote: Vote | null;
  silenceDeadline: string | null;
  judge: {
    proposed: boolean;
    assigned: boolean;
    proposedById: string | null;
    judgeUser: {
      id: string;
      username: string;
      displayName: string;
    } | null;
    verdictDeadline: string | null;
  };
  cashPaymentStatus: "NONE" | "PENDING" | "MARKED_PAID" | "CONFIRMED" | "DEFAULTED";
  events: ChallengeTimelineEvent[];
}

const VOTE_LABELS: Record<Vote, string> = {
  WIN: "¡Gané yo!",
  LOSS: "Ganó mi rival",
  DRAW: "Empate / Cancelar mutuo",
};

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Reto creado",
  ACCEPTED: "Reto aceptado y pozo reservado",
  CANCELLED: "Invitación cancelada por el creador",
  REJECTED: "Invitación rechazada",
  RESULT_DECLARED: "Declaración de resultado enviada",
  VOTE_CHANGED: "Voto actualizado en vivo",
  DISPUTE_OPENED: "Declaraciones opuestas: se abrió disputa",
  JUDGE_PROPOSED: "Propuesta de amigo Juez enviada",
  JUDGE_APPROVED: "Juez aprobado por ambos jugadores",
  JUDGE_VERDICT: "Fallo del Juez emitido",
  JUDGE_TIMEOUT_48H: "Plazo de 48 h del Juez vencido",
  CLOSED_AGREED: "Reto cerrado por coincidencia de votos",
  CLOSED_DRAW: "Reto cerrado en empate (reembolso)",
  CLOSED_SILENCE_24H: "Reto cerrado tras 24 h de silencio",
  EXPIRED_REFUNDED: "Reto vencido sin declaraciones (reembolso)",
  EVIDENCE_ADDED: "Evidencia multimedia adjuntada",
  CASH_MARKED_PAID: "El perdedor informó que ya transfirió",
  CASH_CONFIRMED: "El ganador confirmó el pago recibido",
  CASH_DEFAULT_CLAIMED: "Incumplimiento de pago registrado",
};

const STATUS_LABELS: Record<ChallengeDetailData["status"], string> = {
  PENDING: "Pendiente de aceptación",
  ACTIVE: "En Juego",
  RESULT: "Esperando Declaración",
  DISPUTE: "En Disputa",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export function ChallengeDetailClient({ id }: { id: string }) {
  const { session } = useShell();

  const [detail, setDetail] = useState<ChallengeDetailData | null>(null);
  const [evidences, setEvidences] = useState<ChallengeEvidenceItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState<string>("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const loadAll = useCallback(async () => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [d, evRes, frRes] = await Promise.all([
        apiFetch<ChallengeDetailData>(`/challenges/${id}`, {
          token: session.accessToken,
        }),
        apiFetch<{ items?: ChallengeEvidenceItem[] } | ChallengeEvidenceItem[]>(
          `/challenges/${id}/evidence`,
          { token: session.accessToken },
        ).catch(() => []),
        apiFetch<FriendItem[]>("/friends", { token: session.accessToken }).catch(
          () => [],
        ),
      ]);
      setDetail(d);
      const evItems = Array.isArray(evRes) ? evRes : (evRes.items ?? []);
      setEvidences(evItems);
      setFriends(frRes);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo cargar el detalle del reto.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, session?.accessToken]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleVote(vote: Vote) {
    if (!detail) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/challenges/${detail.id}/declare`, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
      setEditingVote(false);
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo registrar tu voto.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleProposeJudge(judgeId: string) {
    if (!detail || !judgeId) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/challenges/${detail.id}/judge/propose`, {
        method: "POST",
        body: JSON.stringify({ judgeId }),
      });
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo proponer al Juez.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApproveJudge() {
    if (!detail) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/challenges/${detail.id}/judge/approve`, {
        method: "POST",
      });
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo aprobar al Juez.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleJudgeVerdict(winnerId: string) {
    if (!detail) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/challenges/${detail.id}/judge/verdict`, {
        method: "POST",
        body: JSON.stringify({ winnerId }),
      });
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo emitir el fallo.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleEvidenceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    setUploadingEvidence(true);
    setError(null);
    try {
      const presigned = await apiFetch<{
        key: string;
        uploadUrl: string;
      }>(`/challenges/${detail.id}/evidence/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        }),
      });
      await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      await apiFetch(`/challenges/${detail.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          key: presigned.key,
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        }),
      });
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo adjuntar la evidencia.",
      );
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function handleCashAction(action: "paid" | "confirm" | "default") {
    if (!detail) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/challenges/${detail.id}/cash-payment/${action}`, {
        method: "POST",
      });
      await loadAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo actualizar el estado del pago.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-space-md">
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">
          Detalle del reto
        </h1>
        <p className="type-body-md text-on-surface-variant">
          Iniciá sesión o registrate para ver este desafío.
        </p>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="flex flex-col gap-space-md">
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">
          Cargando desafío...
        </h1>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-space-md">
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">
          Detalle del reto
        </h1>
        {error && (
          <div
            role="alert"
            className="type-body-md rounded-md bg-error-container p-space-sm text-on-error-container"
          >
            {error}
          </div>
        )}
        <Link
          href="/"
          className="type-label-lg touch-target inline-flex items-center justify-center rounded-lg px-space-md btn-3d btn-3d--primary"
        >
          Volver a Retos
        </Link>
      </div>
    );
  }

  const activeDeadline =
    detail.silenceDeadline ??
    detail.judge.verdictDeadline ??
    detail.expiresAt;

  const canDeclare =
    detail.role !== "JUDGE" &&
    (detail.status === "ACTIVE" ||
      detail.status === "RESULT" ||
      detail.status === "DISPUTE");

  const showVoteButtons =
    canDeclare && (detail.myVote === null || editingVote);

  const eligibleJudgeFriends = friends.filter(
    (f) => f.id !== detail.creator.id && f.id !== detail.opponent?.id,
  );

  return (
    <div className="flex flex-col gap-space-md">
      {/* Encabezado y Cuenta Regresiva */}
      <section
        data-testid="detail-status-banner"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            data-testid="detail-status-badge"
            className={`type-label-sm rounded-full px-3 py-1 ${
              detail.status === "DISPUTE"
                ? "bg-error-container text-on-error-container"
                : detail.status === "CLOSED"
                  ? "bg-secondary-container text-on-secondary-container"
                  : "bg-surface-sky-tint text-primary"
            }`}
          >
            {STATUS_LABELS[detail.status]}
          </span>

          <div
            data-testid="detail-countdown"
            className="type-label-md flex items-center gap-1 text-on-surface-variant"
          >
            <Icon name="timer" size={18} />
            <span>
              {detail.status === "CLOSED"
                ? "Finalizado"
                : detail.status === "CANCELLED"
                  ? "Cancelado"
                  : formatRemaining(activeDeadline)}
            </span>
          </div>
        </div>

        <h1
          data-testid="detail-title"
          className="type-headline-lg-mobile text-ink-navy-deep"
        >
          {detail.title}
        </h1>

        {detail.status === "CLOSED" && (
          <div
            data-testid="detail-closed-outcome"
            className="rounded-md bg-secondary-container px-space-sm py-2 text-on-secondary-container"
          >
            {detail.winnerId === null ? (
              <span className="type-label-lg">
                Resultado: Empate · Se reembolsó la apuesta a cada jugador.
              </span>
            ) : detail.winnerId === detail.creator.id ? (
              <span className="type-label-lg">
                Ganador: {detail.creator.displayName} (@{detail.creator.username})
              </span>
            ) : (
              <span className="type-label-lg">
                Ganador: {detail.opponent?.displayName} (@
                {detail.opponent?.username})
              </span>
            )}
          </div>
        )}
      </section>

      {/* Cara a Cara y Barra 50/50 del Pozo */}
      <section
        data-testid="detail-pot-bar"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="grid grid-cols-2 gap-space-sm">
          <div className="rounded-md bg-surface-sky-tint p-space-sm">
            <p className="type-label-lg text-ink-navy-deep">
              {detail.creator.displayName}
            </p>
            <p className="type-label-sm text-on-surface-variant">
              @{detail.creator.username} · {detail.creator.credibility.score}%
              Fair Play
            </p>
          </div>

          <div className="rounded-md bg-surface-sky-tint p-space-sm text-right">
            {detail.opponent ? (
              <>
                <p className="type-label-lg text-ink-navy-deep">
                  {detail.opponent.displayName}
                </p>
                <p className="type-label-sm text-on-surface-variant">
                  @{detail.opponent.username} ·{" "}
                  {detail.opponent.credibility.score}% Fair Play
                </p>
              </>
            ) : (
              <>
                <p className="type-label-lg text-on-surface-variant">
                  Rival pendiente
                </p>
                <p className="type-label-sm text-on-surface-variant">
                  Esperando que acepte
                </p>
              </>
            )}
          </div>
        </div>

        {/* Barra 50/50 */}
        <div>
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="type-label-sm">
              50% ({detail.stakeAmount.toLocaleString("es-AR")})
            </span>
            <span
              data-testid="detail-pot-total"
              className="type-label-md text-ink-navy-deep"
            >
              {detail.mode === "COINS"
                ? `Pozo 50/50: ${(detail.pot ?? detail.stakeAmount * 2).toLocaleString("es-AR")} monedas`
                : `Acuerdo 50/50: $${detail.stakeAmount.toLocaleString("es-AR")} c/u`}
            </span>
            <span className="type-label-sm">
              50% ({detail.stakeAmount.toLocaleString("es-AR")})
            </span>
          </div>
          <div
            data-testid="pot-split-bar"
            className="mt-1 grid h-3 w-full grid-cols-2 overflow-hidden rounded-full bg-surface-sky-subtle"
          >
            <div className="bg-primary-container" />
            <div
              className={
                detail.status === "PENDING"
                  ? "bg-surface-sky-subtle"
                  : "bg-tertiary-fixed-dim"
              }
            />
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          data-testid="detail-error"
          className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
        >
          {error}
        </div>
      )}

      {/* Declarar Resultado / Cambiar Voto en Vivo */}
      {canDeclare && (
        <section
          data-testid="declare-section"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="type-title-md text-ink-navy-deep">
              Declarar resultado
            </h2>
            {detail.rivalHasVoted && detail.status === "RESULT" && (
              <span className="type-label-sm rounded-full bg-alert-coral px-2.5 py-0.5 text-on-primary">
                Tu rival ya declaró
              </span>
            )}
          </div>

          {detail.silenceDeadline && (
            <div
              data-testid="silence-countdown-box"
              className="type-body-md flex items-center gap-space-xs rounded-md bg-surface-sky-tint p-space-sm text-ink-navy-deep"
            >
              <Icon name="schedule" size={18} className="text-primary" />
              <span>
                Plazo de 24 h por silencio:{" "}
                <strong>{formatRemaining(detail.silenceDeadline)}</strong>
              </span>
            </div>
          )}

          {detail.myVote !== null && !editingVote ? (
            <div className="flex flex-col gap-space-sm">
              <div
                data-testid="my-current-vote"
                className="flex items-center justify-between rounded-md bg-surface-sky-tint p-space-sm"
              >
                <span className="type-body-md text-on-surface-variant">
                  Tu declaración actual:
                </span>
                <span className="type-label-lg text-ink-navy-deep">
                  {VOTE_LABELS[detail.myVote]}
                </span>
              </div>

              <button
                type="button"
                data-testid="btn-change-vote"
                onClick={() => setEditingVote(true)}
                className="type-label-md touch-target inline-flex items-center justify-center gap-1 rounded-lg px-space-md btn-3d btn-3d--soft"
              >
                <Icon name="edit" size={18} />
                <span>Cambiar mi voto en vivo</span>
              </button>
            </div>
          ) : null}

          {showVoteButtons && (
            <div
              data-testid="vote-buttons-group"
              className="grid grid-cols-1 gap-space-xs"
            >
              <button
                type="button"
                disabled={actionBusy}
                data-testid="vote-win"
                onClick={() => handleVote("WIN")}
                className="type-label-lg touch-target flex items-center justify-between rounded-lg px-space-md btn-3d btn-3d--success"
              >
                <span className="flex items-center gap-space-xs">
                  <Icon name="emoji_events" filled size={20} />
                  <span>¡Gané yo!</span>
                </span>
                <Icon name="chevron_right" size={18} />
              </button>

              <button
                type="button"
                disabled={actionBusy}
                data-testid="vote-loss"
                onClick={() => handleVote("LOSS")}
                className="type-label-lg touch-target flex items-center justify-between rounded-lg px-space-md btn-3d btn-3d--primary"
              >
                <span className="flex items-center gap-space-xs">
                  <Icon name="handshake" filled size={20} />
                  <span>Ganó mi rival</span>
                </span>
                <Icon name="chevron_right" size={18} />
              </button>

              <button
                type="button"
                disabled={actionBusy}
                data-testid="vote-draw"
                onClick={() => handleVote("DRAW")}
                className="type-label-lg touch-target flex items-center justify-between rounded-lg px-space-md btn-3d btn-3d--soft"
              >
                <span className="flex items-center gap-space-xs">
                  <Icon name="balance" size={20} />
                  <span>Empate / Cancelar mutuo</span>
                </span>
                <Icon name="chevron_right" size={18} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Disputa y 3er Amigo Juez */}
      {detail.status === "DISPUTE" && (
        <section
          data-testid="dispute-judge-section"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <div className="flex items-center gap-space-xs">
            <Icon name="gavel" filled size={22} className="text-alert-coral" />
            <h2 className="type-title-md text-ink-navy-deep">
              Resolución por 3er amigo Juez
            </h2>
          </div>

          <p className="type-body-md text-on-surface-variant">
            Las declaraciones no coincidieron. Pueden rectificar su voto arriba o
            elegir de común acuerdo a un amigo como Juez (+5 monedas por laudar).
          </p>

          {detail.role === "JUDGE" && detail.judge.assigned ? (
            <div
              data-testid="judge-verdict-panel"
              className="flex flex-col gap-space-sm rounded-md bg-surface-sky-tint p-space-md"
            >
              <p className="type-label-lg text-ink-navy-deep">
                Sos el Juez designado. Elegí quién ganó este desafío:
              </p>
              {detail.judge.verdictDeadline && (
                <p
                  data-testid="judge-countdown"
                  className="type-label-sm text-on-surface-variant"
                >
                  Plazo de 48 h para fallar:{" "}
                  {formatRemaining(detail.judge.verdictDeadline)}
                </p>
              )}
              <div className="grid grid-cols-1 gap-space-xs">
                <button
                  type="button"
                  disabled={actionBusy}
                  data-testid="verdict-creator"
                  onClick={() => handleJudgeVerdict(detail.creator.id)}
                  className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--primary"
                >
                  Ganó {detail.creator.displayName} (@{detail.creator.username})
                </button>
                {detail.opponent && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    data-testid="verdict-opponent"
                    onClick={() => handleJudgeVerdict(detail.opponent!.id)}
                    className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--success"
                  >
                    Ganó {detail.opponent.displayName} (@
                    {detail.opponent.username})
                  </button>
                )}
              </div>
            </div>
          ) : detail.judge.assigned ? (
            <div
              data-testid="judge-assigned-status"
              className="rounded-md bg-surface-sky-tint p-space-sm"
            >
              <p className="type-label-lg text-ink-navy-deep">
                Juez activo: {detail.judge.judgeUser?.displayName} (@
                {detail.judge.judgeUser?.username})
              </p>
              {detail.judge.verdictDeadline && (
                <p
                  data-testid="judge-countdown"
                  className="type-body-md mt-0.5 text-on-surface-variant"
                >
                  Tiempo restante para su veredicto:{" "}
                  {formatRemaining(detail.judge.verdictDeadline)}
                </p>
              )}
            </div>
          ) : detail.judge.proposed ? (
            <div
              data-testid="judge-proposed-box"
              className="flex flex-col gap-space-sm rounded-md bg-surface-sky-tint p-space-sm"
            >
              <p className="type-body-md text-ink-navy-deep">
                Juez propuesto:{" "}
                <strong>
                  {detail.judge.judgeUser?.displayName} (@
                  {detail.judge.judgeUser?.username})
                </strong>
              </p>
              {detail.judge.proposedById !== session.user.id ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  data-testid="btn-approve-judge"
                  onClick={handleApproveJudge}
                  className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--success"
                >
                  Aprobar Juez
                </button>
              ) : (
                <p className="type-label-sm text-on-surface-variant">
                  Esperando a que tu rival apruebe la propuesta.
                </p>
              )}
            </div>
          ) : (
            <div
              data-testid="propose-judge-box"
              className="flex flex-col gap-space-xs"
            >
              <label
                htmlFor="judge-select"
                className="type-label-md text-ink-navy-deep"
              >
                Proponer un amigo como Juez:
              </label>
              <div className="flex gap-space-xs">
                <select
                  id="judge-select"
                  data-testid="propose-judge-select"
                  value={selectedJudgeId}
                  onChange={(e) => setSelectedJudgeId(e.target.value)}
                  className="type-body-md flex-1 rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep"
                >
                  <option value="">Elegí un amigo...</option>
                  {eligibleJudgeFriends.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName} (@{f.username})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={actionBusy || !selectedJudgeId}
                  data-testid="btn-propose-judge"
                  onClick={() => handleProposeJudge(selectedJudgeId)}
                  className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--primary"
                >
                  Proponer
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Acuerdo de Pago en Modo Plata (cuando cerró con ganador) */}
      {detail.status === "CLOSED" &&
        detail.mode === "CASH" &&
        detail.winnerId !== null && (
          <section
            data-testid="cash-payment-section"
            className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
          >
            <h2 className="type-title-md text-ink-navy-deep">
              Liquidación entre amigos (Modo Plata)
            </h2>
            <p className="type-body-md text-on-surface-variant">
              Estado del pago:{" "}
              <strong data-testid="cash-payment-status">
                {detail.cashPaymentStatus}
              </strong>
            </p>
            <div className="flex flex-wrap gap-space-xs">
              {detail.winnerId !== session.user.id &&
                detail.cashPaymentStatus === "PENDING" && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    data-testid="btn-cash-mark-paid"
                    onClick={() => handleCashAction("paid")}
                    className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--primary"
                  >
                    Ya transferí
                  </button>
                )}
              {detail.winnerId === session.user.id &&
                (detail.cashPaymentStatus === "PENDING" ||
                  detail.cashPaymentStatus === "MARKED_PAID") && (
                  <>
                    <button
                      type="button"
                      disabled={actionBusy}
                      data-testid="btn-cash-confirm"
                      onClick={() => handleCashAction("confirm")}
                      className="type-label-lg touch-target rounded-lg px-space-md btn-3d btn-3d--success"
                    >
                      Pago recibido
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      data-testid="btn-cash-default"
                      onClick={() => handleCashAction("default")}
                      className="type-label-md touch-target rounded-lg px-space-sm btn-3d btn-3d--danger-soft"
                    >
                      Reclamar incumplimiento
                    </button>
                  </>
                )}
            </div>
          </section>
        )}

      {/* Evidencia Opcional (Foto / Video) */}
      <section
        data-testid="evidence-section"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex items-center justify-between">
          <h2 className="type-title-md text-ink-navy-deep">
            Evidencia opcional
          </h2>
          {(detail.status === "ACTIVE" ||
            detail.status === "RESULT" ||
            detail.status === "DISPUTE") &&
            detail.role !== "JUDGE" && (
              <label className="type-label-md cursor-pointer rounded-full bg-surface-sky-tint px-3 py-1.5 text-primary">
                <span>
                  {uploadingEvidence ? "Subiendo..." : "+ Subir foto/video"}
                </span>
                <input
                  type="file"
                  data-testid="evidence-file-input"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                  onChange={handleEvidenceFile}
                  className="sr-only"
                />
              </label>
            )}
        </div>

        {evidences.length === 0 ? (
          <p className="type-body-md text-on-surface-variant">
            No se adjuntaron fotos ni videos en este reto (es opcional).
          </p>
        ) : (
          <ul
            data-testid="evidence-list"
            className="grid grid-cols-1 gap-space-sm"
          >
            {evidences.map((ev) => (
              <li
                key={ev.key}
                data-testid="evidence-item"
                className="overflow-hidden rounded-md bg-surface-sky-tint p-space-xs"
              >
                {ev.kind === "VIDEO" ? (
                  <video
                    controls
                    src={ev.url}
                    className="max-h-64 w-full rounded"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ev.url}
                    alt="Evidencia del reto"
                    className="max-h-64 w-full rounded object-cover"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bitácora Cronológica del Reto */}
      <section
        data-testid="timeline-section"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <h2 className="type-title-md text-ink-navy-deep">Bitácora del reto</h2>
        <ol
          data-testid="timeline-list"
          className="flex flex-col gap-space-xs border-l-2 border-surface-sky-subtle pl-space-sm"
        >
          {detail.events.map((ev) => (
            <li
              key={ev.id}
              data-testid="timeline-event"
              className="flex flex-col"
            >
              <span className="type-label-md text-ink-navy-deep">
                {EVENT_LABELS[ev.eventType] ?? ev.eventType}
              </span>
              <span className="type-label-sm text-on-surface-variant">
                {new Date(ev.createdAt).toLocaleString("es-AR")}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

