"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useShell } from "./shell-context";

/**
 * Chip de saldo con conmutador de modo. La parte del saldo lleva al Monedero: en Monedas muestra
 * el saldo (o "—" mientras no se conoce) y en Plata "Amigos", porque la app no custodia dinero.
 * A su lado, un mini botón 3D (interruptor) alterna Monedas ⇄ Plata y muestra el icono del otro modo.
 */
export function BalanceChip() {
  const { mode, setMode, coins } = useShell();
  const isCoins = mode === "COINS";

  return (
    <div data-testid="balance-chip" className="flex items-center gap-space-xs">
      <Link href="/monedero" data-testid="balance-link" className="flex h-12 items-center">
        <span className="type-label-lg flex h-9 items-center gap-space-xs rounded-full bg-tertiary-fixed px-space-sm text-on-tertiary-fixed shadow-level-1">
          <Icon name={isCoins ? "paid" : "payments"} filled size={18} className="text-tertiary" />
          <span className="leading-none">
            {isCoins ? (coins === null ? "—" : coins.toLocaleString("es-AR")) : "Amigos"}
          </span>
          <span className="sr-only">{isCoins ? "monedas" : "modo plata"}</span>
        </span>
      </Link>
      <button
        type="button"
        role="switch"
        aria-checked={!isCoins}
        aria-label="Modo Plata"
        data-testid="mode-switch"
        onClick={() => setMode(isCoins ? "CASH" : "COINS")}
        className="btn-3d-host flex h-12 w-12 items-center justify-center"
      >
        <span className="btn-3d btn-3d--primary btn-3d--mini flex h-9 w-9 items-center justify-center rounded-full">
          <Icon name={isCoins ? "payments" : "paid"} filled size={20} />
        </span>
      </button>
    </div>
  );
}
