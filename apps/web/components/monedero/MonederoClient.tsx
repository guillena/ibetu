"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell } from "@/components/shell/shell-context";
import { ApiError, apiFetch } from "@/lib/api";

export interface WalletTransactionItem {
  id: string;
  type:
    | "BONUS_INIT"
    | "BONUS_WSP"
    | "STREAK3"
    | "REFERRAL"
    | "JUDGE"
    | "LIFELINE"
    | "RESERVE"
    | "PAYOUT"
    | "REFUND";
  amount: number;
  challengeId: string | null;
  createdAt: string;
}

export interface WalletSummary {
  coinsAvailable: number;
  coinsReserved: number;
  streakDaysCount: number;
  lastCleanChallengeAt: string | null;
  lastLifelineAt: string | null;
  lifelineEligible: boolean;
  lifelineNextAvailableAt: string | null;
  whatsappLinked: boolean;
  paymentAlias: string | null;
  transactions: WalletTransactionItem[];
}

const TX_LABELS: Record<WalletTransactionItem["type"], string> = {
  BONUS_INIT: "Regalo de bienvenida",
  BONUS_WSP: "Bono por vincular WhatsApp",
  STREAK3: "Premio de Constancia (3 días seguidos)",
  REFERRAL: "Premio por amigo invitado",
  JUDGE: "Recompensa por laudar como Juez",
  LIFELINE: "Salvavidas diario",
  RESERVE: "Reserva para reto",
  PAYOUT: "Liquidación de reto",
  REFUND: "Reembolso de reto",
};

export function MonederoClient() {
  const { session, coins, setCoins } = useShell();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyLifeline, setBusyLifeline] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasSaved, setAliasSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const data = await apiFetch<WalletSummary>("/wallet", {
        token: session.accessToken,
      });
      setSummary(data);
      setCoins(data.coinsAvailable);
      setAliasInput(data.paymentAlias ?? "");
    } catch {
      /* mantenemos vista previa si falla la red */
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, setCoins]);

  useEffect(() => {
    if (session?.accessToken) {
      void loadWallet();
    }
  }, [session?.accessToken, loadWallet]);

  async function handleClaimLifeline() {
    setBusyLifeline(true);
    setError(null);
    try {
      const res = await apiFetch<{ granted: number; coinsAvailable: number }>(
        "/wallet/lifeline",
        { method: "POST" },
      );
      setCoins(res.coinsAvailable);
      await loadWallet();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo reclamar el Salvavidas.",
      );
    } finally {
      setBusyLifeline(false);
    }
  }

  async function handleSaveAlias(e: React.FormEvent) {
    e.preventDefault();
    setAliasSaved(false);
    setError(null);
    try {
      await apiFetch("/me/payment-alias", {
        method: "PUT",
        body: JSON.stringify({ alias: aliasInput.trim() }),
      });
      setAliasSaved(true);
      await loadWallet();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar tu alias.",
      );
    }
  }

  const available = summary?.coinsAvailable ?? coins ?? 0;
  const reserved = summary?.coinsReserved ?? 0;
  const streak = summary?.streakDaysCount ?? 0;

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Monedero</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Tu saldo disponible, lo que tenés en juego y cómo sumar monedas.
        </p>
      </div>

      {/* Tarjetas de Saldo Disponible y En Juego */}
      <section
        data-testid="wallet-balances"
        className="grid grid-cols-2 gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div
          data-testid="wallet-available"
          className="flex flex-col justify-between rounded-md bg-tertiary-fixed p-space-sm text-on-tertiary-fixed"
        >
          <span className="type-label-sm">Saldo disponible</span>
          <div className="mt-1 flex items-center gap-1">
            <Icon name="paid" filled size={22} className="text-tertiary" />
            <span className="type-headline-md">
              {session ? available.toLocaleString("es-AR") : "—"}
            </span>
          </div>
          <span className="type-label-sm">monedas listas para jugar</span>
        </div>

        <div
          data-testid="wallet-reserved"
          className="flex flex-col justify-between rounded-md bg-surface-sky-tint p-space-sm text-ink-navy-deep"
        >
          <span className="type-label-sm text-on-surface-variant">
            En juego
          </span>
          <div className="mt-1 flex items-center gap-1">
            <Icon name="lock" size={20} className="text-primary" />
            <span className="type-headline-md">
              {session ? reserved.toLocaleString("es-AR") : "—"}
            </span>
          </div>
          <span className="type-label-sm text-on-surface-variant">
            reservadas en retos activos
          </span>
        </div>
      </section>

      {/* Progreso de los 3 días de Constancia (+30 monedas) */}
      <section
        data-testid="wallet-streak-card"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <Icon name="local_fire_department" filled size={22} className="text-tertiary" />
            <h2 className="type-title-md text-ink-navy-deep">
              Premio de Constancia (3 días)
            </h2>
          </div>
          <span
            data-testid="wallet-streak-count"
            className="type-label-md rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-on-tertiary-fixed"
          >
            {streak}/3 días
          </span>
        </div>

        <p className="type-body-md text-on-surface-variant">
          Cerrá al menos 1 reto limpio por día durante 3 días seguidos (ganes o
          pierdas) y recibí <strong>+30 monedas</strong>.
        </p>

        <div className="grid grid-cols-3 gap-space-xs">
          {[1, 2, 3].map((day) => {
            const done = streak >= day;
            return (
              <div
                key={day}
                data-testid={`streak-day-${day}`}
                data-completed={done ? "true" : "false"}
                className={`flex flex-col items-center rounded-md p-space-xs text-center ${
                  done
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-surface-sky-tint text-on-surface-variant"
                }`}
              >
                <Icon
                  name={done ? "check_circle" : "radio_button_unchecked"}
                  filled={done}
                  size={20}
                />
                <span className="type-label-md mt-1">Día {day}</span>
                {day === 3 && (
                  <span className="type-label-sm">+30 monedas</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Salvavidas Diario (+20 monedas) */}
      <section
        data-testid="wallet-lifeline-card"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex items-start justify-between gap-space-sm">
          <div>
            <h2 className="type-title-md text-ink-navy-deep">
              Salvavidas diario (+20 monedas)
            </h2>
            <p className="type-body-md mt-0.5 text-on-surface-variant">
              Disponible cada 24 h cuando tenés menos de 10 monedas y ningún
              reto activo en curso.
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sky-tint text-primary">
            <Icon name="support" size={22} />
          </span>
        </div>

        <button
          type="button"
          data-testid="btn-lifeline"
          disabled={!summary?.lifelineEligible || busyLifeline}
          onClick={handleClaimLifeline}
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
        >
          <Icon name="redeem" filled size={20} />
          <span>
            {busyLifeline
              ? "Acreditando..."
              : summary?.lifelineEligible
                ? "Pedir Salvavidas (+20 monedas)"
                : "Salvavidas no necesario ahora"}
          </span>
        </button>
      </section>

      {/* Alias / CVU para Modo Plata */}
      {session && (
        <section
          data-testid="wallet-alias-card"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <h2 className="type-title-md text-ink-navy-deep">
            Tu alias o CVU (Modo Plata)
          </h2>
          <p className="type-body-md text-on-surface-variant">
            Solo se muestra a tu amigo cuando ganás un reto por Plata para que
            pueda transferirte directo.
          </p>
          <form onSubmit={handleSaveAlias} className="flex gap-space-xs">
            <input
              type="text"
              data-testid="input-payment-alias"
              placeholder="Ej: martin.mp"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              className="type-body-md flex-1 rounded-md bg-surface-sky-tint px-space-sm py-2 text-ink-navy-deep"
            />
            <button
              type="submit"
              data-testid="btn-save-alias"
              className="type-label-md touch-target rounded-lg px-space-md btn-3d btn-3d--primary"
            >
              Guardar
            </button>
          </form>
          {aliasSaved && (
            <span className="type-label-sm text-secondary">
              Alias actualizado correctamente.
            </span>
          )}
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="type-body-md rounded-md bg-error-container p-space-sm text-on-error-container"
        >
          {error}
        </div>
      )}

      {/* Historial de Movimientos */}
      <section
        data-testid="wallet-transactions"
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <h2 className="type-title-md text-ink-navy-deep">
          Historial de movimientos
        </h2>

        {!summary || summary.transactions.length === 0 ? (
          <p className="type-body-md text-on-surface-variant">
            {loading
              ? "Cargando movimientos..."
              : "Acá vas a ver tu saldo y tus movimientos."}
          </p>
        ) : (
          <ul
            data-testid="wallet-tx-list"
            className="flex flex-col divide-y divide-surface-sky-subtle"
          >
            {summary.transactions.map((tx) => (
              <li
                key={tx.id}
                data-testid="wallet-tx-item"
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <p className="type-label-md text-ink-navy-deep">
                    {TX_LABELS[tx.type] ?? tx.type}
                  </p>
                  <p className="type-label-sm text-on-surface-variant">
                    {new Date(tx.createdAt).toLocaleString("es-AR")}
                  </p>
                </div>
                <span
                  className={`type-label-lg ${
                    tx.amount >= 0 ? "text-secondary" : "text-ink-navy-deep"
                  }`}
                >
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount} monedas
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

