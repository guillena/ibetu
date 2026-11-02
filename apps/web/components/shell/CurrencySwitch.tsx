"use client";

import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell } from "./shell-context";
import type { CurrencyMode } from "./shell-context";

const OPTIONS: { value: CurrencyMode; label: string; icon: string }[] = [
  { value: "COINS", label: "Monedas", icon: "paid" },
  { value: "CASH", label: "Plata", icon: "payments" },
];

/**
 * Switch "Monedas / Plata" (como una cuenta demo o real). Es un grupo de radios accesible:
 * se mueve con las flechas y cada opción mide 48 px de alto, el mínimo táctil del sistema.
 */
export function CurrencySwitch() {
  const { mode, setMode } = useShell();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = mode === "COINS" ? "CASH" : "COINS";
    setMode(next);
    // El foco acompaña a la opción recién elegida.
    const group = event.currentTarget.parentElement;
    group?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Modo de juego"
      className="flex h-[3.75rem] w-full items-start gap-space-xxs rounded-full bg-surface-sky-subtle p-space-xxs pb-space-xs"
    >
      {OPTIONS.map((option) => {
        const checked = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-mode={option.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => setMode(option.value)}
            onKeyDown={onKeyDown}
            className={`type-label-lg flex h-12 flex-1 items-center justify-center gap-space-xs rounded-full ${
              checked
                ? "btn-3d btn-3d--primary"
                : "text-on-surface-variant transition-transform active:scale-[0.98]"
            }`}
          >
            <Icon name={option.icon} filled={checked} size={20} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

