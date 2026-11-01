"use client";

import { Icon } from "@/components/ui/Icon";
import { useShell } from "./shell-context";

/**
 * Chip de saldo. En Monedas muestra el saldo (o "—" mientras no se conoce); en Plata no hay
 * saldo que mostrar porque la app no custodia dinero: el acuerdo es directo entre amigos.
 */
export function BalanceChip() {
  const { mode, coins } = useShell();
  const isCoins = mode === "COINS";

  return (
    <div
      data-testid="balance-chip"
      className="type-label-lg flex h-9 items-center gap-space-xs rounded-full bg-tertiary-fixed px-space-sm text-on-tertiary-fixed shadow-level-1"
    >
      <Icon name={isCoins ? "paid" : "payments"} filled size={18} className="text-tertiary" />
      <span className="leading-none">
        {isCoins ? (coins === null ? "—" : coins.toLocaleString("es-AR")) : "Entre amigos"}
      </span>
      <span className="sr-only">{isCoins ? "monedas" : "modo plata"}</span>
    </div>
  );
}

