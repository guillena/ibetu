"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell, type CurrencyMode } from "@/components/shell/shell-context";
import { apiFetch } from "@/lib/api";

export interface HistoryItem {
  id: string;
  title: string;
  mode: CurrencyMode;
  stakeAmount: number;
  closedAt: string;
  rival: { id: string; username: string; displayName: string };
  outcome: "WON" | "LOST" | "DRAW";
  winnerId: string | null;
  resolvedBy: "AGREEMENT" | "JUDGE" | "TIMEOUT" | null;
  hadDispute: boolean;
  cashPaymentStatus: string | null;
}

export interface HistoryPageData {
  items: HistoryItem[];
  summary: {
    total: number;
    wins: number;
    losses: number;
    draws: number;
  };
  nextCursor: string | null;
}

const OUTCOME_STYLE: Record<
  HistoryItem["outcome"],
  { label: string; className: string }
> = {
  WON: {
    label: "Victoria",
    className: "bg-secondary-container text-on-secondary-container",
  },
  LOST: {
    label: "Derrota",
    className: "bg-error-container text-on-error-container",
  },
  DRAW: {
    label: "Empate",
    className: "bg-surface-sky-tint text-ink-navy-deep",
  },
};

const RESOLVED_BY_LABELS: Record<
  NonNullable<HistoryItem["resolvedBy"]>,
  string
> = {
  AGREEMENT: "De común acuerdo",
  JUDGE: "Laudo de Juez",
  TIMEOUT: "Por silencio de 24 h",
};

export function HistorialClient() {
  const { session } = useShell();
  const [data, setData] = useState<HistoryPageData>({
    items: [],
    summary: { total: 0, wins: 0, losses: 0, draws: 0 },
    nextCursor: null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    let active = true;
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const withRival = params?.get("with");
    const query = withRival ? `?with=${encodeURIComponent(withRival)}` : "";

    setLoading(true);
    apiFetch<HistoryPageData>(`/challenges/history${query}`, {
      token: session.accessToken,
    })
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Historial</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Tus retos cerrados y tu balance de victorias.
        </p>
      </div>

      {/* Balance de victorias */}
      <section
        data-testid="history-summary"
        className="grid grid-cols-4 gap-space-xs rounded-lg bg-surface-container-lowest p-space-md text-center shadow-level-1"
      >
        <div className="rounded-md bg-surface-sky-tint p-space-xs">
          <span className="type-label-sm text-on-surface-variant">Jugados</span>
          <p
            data-testid="history-total"
            className="type-headline-sm text-ink-navy-deep"
          >
            {data.summary.total}
          </p>
        </div>
        <div className="rounded-md bg-secondary-container p-space-xs text-on-secondary-container">
          <span className="type-label-sm">Victorias</span>
          <p data-testid="history-wins" className="type-headline-sm">
            {data.summary.wins}
          </p>
        </div>
        <div className="rounded-md bg-error-container p-space-xs text-on-error-container">
          <span className="type-label-sm">Derrotas</span>
          <p data-testid="history-losses" className="type-headline-sm">
            {data.summary.losses}
          </p>
        </div>
        <div className="rounded-md bg-surface-sky-tint p-space-xs">
          <span className="type-label-sm text-on-surface-variant">Empates</span>
          <p
            data-testid="history-draws"
            className="type-headline-sm text-ink-navy-deep"
          >
            {data.summary.draws}
          </p>
        </div>
      </section>

      {data.items.length > 0 ? (
        <ul data-testid="history-list" className="flex flex-col gap-space-sm">
          {data.items.map((item) => {
            const outcome = OUTCOME_STYLE[item.outcome];
            return (
              <li
                key={item.id}
                data-testid="history-item"
                className="flex flex-col gap-space-xs rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`type-label-sm rounded-full px-2.5 py-0.5 ${outcome.className}`}
                  >
                    {outcome.label}
                  </span>
                  <span className="type-label-sm text-on-surface-variant">
                    {item.resolvedBy
                      ? RESOLVED_BY_LABELS[item.resolvedBy]
                      : "Cerrado"}
                  </span>
                </div>

                <h2 className="type-title-md text-ink-navy-deep">
                  {item.title}
                </h2>
                <p className="type-body-md text-on-surface-variant">
                  vs. {item.rival.displayName} (@{item.rival.username}) ·{" "}
                  {item.mode === "COINS"
                    ? `${item.stakeAmount} monedas c/u`
                    : `$${item.stakeAmount.toLocaleString("es-AR")} c/u`}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <span className="type-label-sm text-on-surface-variant">
                    {new Date(item.closedAt).toLocaleDateString("es-AR")}
                  </span>
                  <Link
                    href={`/retos/${item.id}`}
                    className="type-label-md text-primary"
                  >
                    Ver detalle
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section
          data-testid="history-empty-state"
          className="flex flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sky-tint text-primary-container">
            <Icon name="history" filled size={32} />
          </span>
          <p className="type-body-lg text-on-surface">
            {loading
              ? "Cargando historial..."
              : "Cuando cierres tu primer reto, va a quedar registrado acá."}
          </p>
        </section>
      )}
    </div>
  );
}

