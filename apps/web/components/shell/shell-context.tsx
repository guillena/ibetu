"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getStoredSession,
  saveStoredSession,
  subscribeSession,
  type StoredSession,
} from "@/lib/api";

/** Modo de juego: Monedas (gratis) o Plata (acuerdo entre amigos). */
export type CurrencyMode = "COINS" | "CASH";
export type FairPlayBand = "GREEN" | "YELLOW" | "RED";

const STORAGE_KEY = "ibetu:mode";

// El modo vive en localStorage y se lee con useSyncExternalStore: el servidor siempre
// renderiza "Monedas" y el cliente se ajusta sin errores de hidratación.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback); // otra pestaña cambió el modo
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): CurrencyMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "CASH" ? "CASH" : "COINS";
  } catch {
    return "COINS"; // almacenamiento bloqueado (navegación privada, etc.)
  }
}

function getServerSnapshot(): CurrencyMode {
  return "COINS";
}

function getServerSession(): StoredSession | null {
  return null;
}

type ShellState = {
  mode: CurrencyMode;
  setMode: (mode: CurrencyMode) => void;
  /** Saldo de monedas; null mientras no se conoce (todavía no hay sesión cargada). */
  coins: number | null;
  setCoins: (coins: number | null) => void;
  /** Termómetro de Credibilidad (% Fair Play) del usuario; null si no se conoce. */
  fairPlay: { score: number; band: FairPlayBand } | null;
  setFairPlay: (value: { score: number; band: FairPlayBand } | null) => void;
  /** Sesión activa del usuario (JWT + perfil inicial) guardada en localStorage. */
  session: StoredSession | null;
  setSession: (session: StoredSession | null) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const session = useSyncExternalStore(subscribeSession, getStoredSession, getServerSession);
  const [coinsOverride, setCoinsOverride] = useState<number | null>(null);
  const [fairPlayOverride, setFairPlayOverride] = useState<ShellState["fairPlay"]>(null);

  const setMode = useCallback((next: CurrencyMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin persistencia: el cambio igual se refleja en esta sesión */
    }
    listeners.forEach((listener) => listener());
  }, []);

  const setSession = useCallback((next: StoredSession | null) => {
    setCoinsOverride(null);
    setFairPlayOverride(null);
    saveStoredSession(next);
  }, []);

  const setCoins = useCallback((next: number | null) => {
    setCoinsOverride((prev) => (prev === next ? prev : next));
    const current = getStoredSession();
    if (next !== null && current && current.user.coinsAvailable !== next) {
      saveStoredSession({
        ...current,
        user: { ...current.user, coinsAvailable: next },
      });
    }
  }, []);

  const setFairPlay = useCallback((next: ShellState["fairPlay"]) => {
    setFairPlayOverride((prev) =>
      prev?.score === next?.score && prev?.band === next?.band ? prev : next,
    );
    const current = getStoredSession();
    if (
      next !== null &&
      current &&
      (current.user.credibilityScore !== next.score ||
        current.user.credibilityStatus !== next.band)
    ) {
      saveStoredSession({
        ...current,
        user: {
          ...current.user,
          credibilityScore: next.score,
          credibilityStatus: next.band,
        },
      });
    }
  }, []);

  const coins = coinsOverride ?? (session ? session.user.coinsAvailable : null);
  const fairPlay =
    fairPlayOverride ??
    (session
      ? { score: session.user.credibilityScore, band: session.user.credibilityStatus }
      : null);

  const value = useMemo(
    () => ({ mode, setMode, coins, setCoins, fairPlay, setFairPlay, session, setSession }),
    [mode, setMode, coins, setCoins, fairPlay, setFairPlay, session, setSession],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell debe usarse dentro de <ShellProvider>.");
  return ctx;
}
