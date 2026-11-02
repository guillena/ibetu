"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useShell, type FairPlayBand } from "@/components/shell/shell-context";
import {
  ApiError,
  apiFetch,
  type OpenChallengeCounts,
  type OpenChallengeItem,
  type OpenChallengeList,
  type ProfileView,
} from "@/lib/api";

export type FilterTab = "IN_PLAY" | "TO_DECLARE" | "INVITATIONS";

const EMPTY_COUNTS: OpenChallengeCounts = {
  inPlay: 0,
  toDeclare: 0,
  toDeclareActionNeeded: 0,
  invitationsReceived: 0,
  invitationsSent: 0,
};

const BAND_META: Record<
  FairPlayBand,
  { label: string; pillClass: string; icon: string }
> = {
  GREEN: {
    label: "Cumplidor",
    pillClass: "bg-secondary-container text-on-secondary-container",
    icon: "verified",
  },
  YELLOW: {
    label: "En observación",
    pillClass: "bg-tertiary-fixed text-on-tertiary-fixed",
    icon: "info",
  },
  RED: {
    label: "Baja credibilidad",
    pillClass: "bg-error-container text-on-error-container",
    icon: "warning",
  },
};

export function formatRemaining(isoDate: string): string {
  const diffMs = new Date(isoDate).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return "Plazo pendiente";
  if (diffMs <= 0) return "Plazo vencido";
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `Quedan ${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 48) {
    const remMin = totalMinutes % 60;
    return remMin > 0 ? `Quedan ${totalHours} h ${remMin} m` : `Quedan ${totalHours} h`;
  }
  const days = Math.ceil(totalHours / 24);
  return `Quedan ${days} días`;
}

function getStatusBadge(item: OpenChallengeItem): {
  label: string;
  className: string;
} {
  if (item.tab === "IN_PLAY") {
    return {
      label: "En juego",
      className: "bg-surface-sky-tint text-primary",
    };
  }
  if (item.tab === "INVITATION_RECEIVED") {
    return {
      label: "Te desafiaron",
      className: "bg-tertiary-fixed text-on-tertiary-fixed",
    };
  }
  if (item.tab === "INVITATION_SENT") {
    return {
      label: "Invitación enviada",
      className: "bg-surface-sky-tint text-on-surface-variant",
    };
  }
  // TO_DECLARE
  if (item.role === "JUDGE") {
    return {
      label: "Sos el Juez",
      className: "bg-alert-coral text-on-primary",
    };
  }
  if (item.status === "DISPUTE") {
    if (item.judge?.assigned) {
      return {
        label: "Esperando al Juez",
        className: "bg-tertiary-fixed text-on-tertiary-fixed",
      };
    }
    return {
      label: item.actionNeeded ? "En disputa · Tu turno" : "En disputa",
      className: "bg-error-container text-on-error-container",
    };
  }
  return {
    label: item.actionNeeded ? "Te toca declarar" : "Esperando a tu rival",
    className: item.actionNeeded
      ? "bg-alert-coral text-on-primary"
      : "bg-surface-sky-tint text-on-surface-variant",
  };
}

export function RetosFeed({ initialData }: { initialData?: OpenChallengeList }) {
  const { session, setSession, fairPlay, setFairPlay, setCoins } = useShell();
  const [selectedTab, setSelectedTab] = useState<FilterTab>("IN_PLAY");
  const [data, setData] = useState<OpenChallengeList>(
    initialData ?? { items: [], counts: EMPTY_COUNTS },
  );
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const [openList, meProfile] = await Promise.all([
        apiFetch<OpenChallengeList>("/challenges", { token: session.accessToken }),
        apiFetch<ProfileView>("/users/me/profile", { token: session.accessToken }).catch(
          () => null,
        ),
      ]);
      setData(openList);
      if (meProfile) {
        setFairPlay({
          score: meProfile.credibility.score,
          band: meProfile.credibility.band,
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, setFairPlay, setSession]);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      return;
    }
    if (session?.accessToken) {
      void loadChallenges();
    } else {
      setData({ items: [], counts: EMPTY_COUNTS });
    }
  }, [initialData, session?.accessToken, loadChallenges]);

  const coinsInPlay = useMemo(() => {
    return data.items
      .filter(
        (i) =>
          i.mode === "COINS" &&
          i.role !== "JUDGE" &&
          (i.tab === "IN_PLAY" || i.tab === "TO_DECLARE" || i.tab === "INVITATION_SENT"),
      )
      .reduce((acc, item) => acc + item.stakeAmount, 0);
  }, [data.items]);

  const filteredItems = useMemo(() => {
    return data.items.filter((item) => {
      if (selectedTab === "IN_PLAY") return item.tab === "IN_PLAY";
      if (selectedTab === "TO_DECLARE") return item.tab === "TO_DECLARE";
      return item.tab === "INVITATION_RECEIVED" || item.tab === "INVITATION_SENT";
    });
  }, [data.items, selectedTab]);

  async function handleAccept(item: OpenChallengeItem) {
    setBusyId(item.id);
    setActionError(null);
    try {
      await apiFetch(`/challenges/${item.id}/accept`, { method: "POST" });
      if (item.mode === "COINS" && session) {
        setCoins(Math.max(0, session.user.coinsAvailable - item.stakeAmount));
      }
      await loadChallenges();
      setSelectedTab("IN_PLAY");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "No se pudo aceptar el reto.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(item: OpenChallengeItem) {
    setBusyId(item.id);
    setActionError(null);
    try {
      await apiFetch(`/challenges/${item.id}/reject`, { method: "POST" });
      await loadChallenges();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "No se pudo rechazar la invitación.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const effectiveFairPlay = fairPlay ?? { score: 100, band: "GREEN" as FairPlayBand };
  const bandMeta = BAND_META[effectiveFairPlay.band];
  const totalInvitations =
    data.counts.invitationsReceived + data.counts.invitationsSent;

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Retos</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Tus desafíos en juego, los que tenés que declarar y las invitaciones.
        </p>
      </div>

      {/* Banner de estado rápido: % Fair Play + Monedas en juego */}
      <section
        data-testid="retos-status-banner"
        aria-label="Resumen de Fair Play y monedas en juego"
        className="grid grid-cols-2 gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-1"
      >
        <div
          data-testid="retos-fair-play"
          className="flex flex-col justify-between rounded-md bg-surface-sky-tint p-space-sm"
        >
          <span className="type-label-sm text-on-surface-variant">
            Termómetro Fair Play
          </span>
          <div className="mt-1 flex items-center gap-space-xs">
            <span className="type-headline-sm text-ink-navy-deep">
              {effectiveFairPlay.score}%
            </span>
            <span
              className={`type-label-sm inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${bandMeta.pillClass}`}
            >
              <Icon name={bandMeta.icon} filled size={14} />
              <span>{bandMeta.label}</span>
            </span>
          </div>
        </div>

        <div
          data-testid="retos-coins-in-play"
          className="flex flex-col justify-between rounded-md bg-surface-sky-tint p-space-sm"
        >
          <span className="type-label-sm text-on-surface-variant">
            Monedas en juego
          </span>
          <div className="mt-1 flex items-center gap-space-xs">
            <Icon name="paid" filled size={20} className="text-tertiary" />
            <span className="type-headline-sm text-ink-navy-deep">
              {coinsInPlay.toLocaleString("es-AR")}
            </span>
            <span className="type-body-md text-on-surface-variant">reservadas</span>
          </div>
        </div>
      </section>

      {/* Filtro segmentado en 3 píldoras: En Juego, Por Declarar, Invitaciones */}
      <div
        role="tablist"
        aria-label="Filtrar retos por estado"
        className="grid grid-cols-3 gap-1 rounded-full bg-surface-sky-tint p-1 pb-2"
      >
        <button
          type="button"
          role="tab"
          data-testid="tab-in-play"
          aria-selected={selectedTab === "IN_PLAY"}
          onClick={() => setSelectedTab("IN_PLAY")}
          className={`type-label-md touch-target relative flex items-center justify-center gap-1 rounded-full px-2 transition-colors ${
            selectedTab === "IN_PLAY"
              ? "btn-3d btn-3d--primary"
              : "text-ink-navy-deep"
          }`}
        >
          <span>En Juego</span>
          <span
            data-testid="count-in-play"
            className={`type-label-sm rounded-full px-1.5 py-0.5 ${
              selectedTab === "IN_PLAY"
                ? "bg-on-primary/20 text-on-primary"
                : "bg-surface-sky-subtle text-ink-navy-deep"
            }`}
          >
            {data.counts.inPlay}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          data-testid="tab-to-declare"
          aria-selected={selectedTab === "TO_DECLARE"}
          onClick={() => setSelectedTab("TO_DECLARE")}
          className={`type-label-md touch-target relative flex items-center justify-center gap-1 rounded-full px-2 transition-colors ${
            selectedTab === "TO_DECLARE"
              ? "btn-3d btn-3d--primary"
              : "text-ink-navy-deep"
          }`}
        >
          <span>Por Declarar</span>
          <span
            data-testid="count-to-declare"
            className={`type-label-sm rounded-full px-1.5 py-0.5 ${
              selectedTab === "TO_DECLARE"
                ? "bg-on-primary/20 text-on-primary"
                : "bg-surface-sky-subtle text-ink-navy-deep"
            }`}
          >
            {data.counts.toDeclare}
          </span>
          {data.counts.toDeclareActionNeeded > 0 && (
            <span
              data-testid="alert-dot-to-declare"
              aria-label="Acción requerida"
              className="absolute top-1.5 right-2 h-2.5 w-2.5 rounded-full bg-alert-coral ring-2 ring-surface-container-lowest"
            />
          )}
        </button>

        <button
          type="button"
          role="tab"
          data-testid="tab-invitations"
          aria-selected={selectedTab === "INVITATIONS"}
          onClick={() => setSelectedTab("INVITATIONS")}
          className={`type-label-md touch-target relative flex items-center justify-center gap-1 rounded-full px-2 transition-colors ${
            selectedTab === "INVITATIONS"
              ? "btn-3d btn-3d--primary"
              : "text-ink-navy-deep"
          }`}
        >
          <span>Invitaciones</span>
          <span
            data-testid="count-invitations"
            className={`type-label-sm rounded-full px-1.5 py-0.5 ${
              selectedTab === "INVITATIONS"
                ? "bg-on-primary/20 text-on-primary"
                : "bg-surface-sky-subtle text-ink-navy-deep"
            }`}
          >
            {totalInvitations}
          </span>
          {data.counts.invitationsReceived > 0 && (
            <span
              data-testid="alert-dot-invitations"
              aria-label="Invitación pendiente"
              className="absolute top-1.5 right-2 h-2.5 w-2.5 rounded-full bg-alert-coral ring-2 ring-surface-container-lowest"
            />
          )}
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
        >
          {actionError}
        </div>
      )}

      {/* Lista de tarjetas de desafíos o estado vacío */}
      {filteredItems.length > 0 ? (
        <ul className="flex flex-col gap-space-sm" data-testid="challenge-list">
          {filteredItems.map((item) => {
            const badge = getStatusBadge(item);
            const deadline =
              item.silenceDeadline ??
              item.judge?.verdictDeadline ??
              item.expiresAt;
            const rivalText =
              item.role === "JUDGE"
                ? `${item.players[0]?.displayName ?? "Jugador 1"} vs. ${item.players[1]?.displayName ?? "Jugador 2"}`
                : item.rival
                  ? `vs. ${item.rival.displayName} (@${item.rival.username})`
                  : "Abierto por link de WhatsApp";

            return (
              <li
                key={item.id}
                data-testid="challenge-card"
                data-challenge-id={item.id}
                data-challenge-tab={item.tab}
                className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`type-label-sm inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${badge.className}`}
                  >
                    {badge.label}
                  </span>

                  <span
                    className={`type-label-md inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                      item.mode === "COINS"
                        ? "bg-tertiary-fixed text-on-tertiary-fixed"
                        : "bg-secondary-container text-on-secondary-container"
                    }`}
                  >
                    <Icon
                      name={item.mode === "COINS" ? "paid" : "payments"}
                      filled
                      size={16}
                    />
                    <span>
                      {item.mode === "COINS"
                        ? `Pozo: ${(item.pot ?? item.stakeAmount * 2).toLocaleString("es-AR")} monedas`
                        : `Plata: $${item.stakeAmount.toLocaleString("es-AR")} c/u`}
                    </span>
                  </span>
                </div>

                <div>
                  <h2 className="type-title-md text-ink-navy-deep">{item.title}</h2>
                  <p className="type-body-md mt-0.5 text-on-surface-variant">
                    {rivalText}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-space-sm pt-1">
                  <div className="type-label-md flex items-center gap-1 text-on-surface-variant">
                    <Icon name="schedule" size={18} />
                    <span>{formatRemaining(deadline)}</span>
                  </div>

                  <div className="flex items-center gap-space-xs">
                    {item.tab === "INVITATION_RECEIVED" ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => handleReject(item)}
                          className="type-label-md touch-target inline-flex items-center justify-center rounded-lg px-space-sm btn-3d btn-3d--soft"
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => handleAccept(item)}
                          className="type-label-lg touch-target inline-flex items-center justify-center rounded-lg px-space-md btn-3d btn-3d--primary"
                        >
                          {busyId === item.id ? "Aceptando..." : "Aceptar Reto"}
                        </button>
                      </>
                    ) : item.tab === "TO_DECLARE" ? (
                      <Link
                        href={`/retos/${item.id}`}
                        className="type-label-lg touch-target inline-flex items-center justify-center gap-1 rounded-lg px-space-md btn-3d btn-3d--primary"
                      >
                        <Icon name="emoji_events" filled size={18} />
                        <span>
                          {item.role === "JUDGE" ? "Dar Veredicto" : "Declarar Ganador"}
                        </span>
                      </Link>
                    ) : (
                      <Link
                        href={`/retos/${item.id}`}
                        className="type-label-lg touch-target inline-flex items-center justify-center gap-1 rounded-lg px-space-md btn-3d btn-3d--primary"
                      >
                        <span>Ver Detalle</span>
                        <Icon name="chevron_right" size={18} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          testId="retos-empty-state"
          character="dadi"
          message={
            loading
              ? "Cargando tus desafíos..."
              : selectedTab === "IN_PLAY"
                ? "Todavía no tenés retos en juego. Creá el primero y mandáselo a un amigo por WhatsApp."
                : selectedTab === "TO_DECLARE"
                  ? "No tenés retos pendientes de declaración ni disputas abiertas."
                  : "No tenés invitaciones pendientes en este momento."
          }
          action={{ href: "/crear", label: "Crear un reto" }}
        />
      )}
    </div>
  );
}

