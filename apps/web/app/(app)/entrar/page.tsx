"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  type AuthCardMode,
  InstantAuthCard,
} from "@/components/auth/InstantAuthCard";
import { useShell } from "@/components/shell/shell-context";
import { Icon } from "@/components/ui/Icon";

function EntrarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useShell();

  const paramMode: AuthCardMode =
    searchParams.get("modo") === "ingresar" ? "ingresar" : "nuevo";
  const [mode, setMode] = useState<AuthCardMode>(paramMode);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMode(paramMode);
  }, [paramMode]);

  useEffect(() => {
    if (mounted && session?.accessToken) {
      router.replace("/");
    }
  }, [mounted, session?.accessToken, router]);

  if (mounted && session?.accessToken) {
    return (
      <div className="py-space-lg text-center type-body-md text-on-surface-variant">
        Cargando tus retos...
      </div>
    );
  }

  function handleModeChange(next: AuthCardMode) {
    setMode(next);
    router.replace(`/entrar?modo=${next}`);
  }

  return (
    <div
      data-testid="entrar-page"
      className="flex flex-col gap-space-md"
    >
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">
          {mode === "nuevo" ? "Empezá a jugar" : "Volvé a tu cuenta"}
        </h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          {mode === "nuevo"
            ? "Creá tu perfil gratis en segundos y recibí +50 monedas de regalo."
            : "Recuperá tu perfil con tu WhatsApp vinculado sin contraseñas."}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Modo de acceso"
        className="grid grid-cols-2 gap-space-xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "nuevo"}
          data-testid="entrar-tab-nuevo"
          onClick={() => handleModeChange("nuevo")}
          className={`type-label-md touch-target inline-flex items-center justify-center gap-1.5 rounded-lg px-space-sm btn-3d ${
            mode === "nuevo" ? "btn-3d--primary" : "btn-3d--soft"
          }`}
        >
          <Icon name="person_add" filled={mode === "nuevo"} size={18} />
          <span>Crear perfil</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === "ingresar"}
          data-testid="entrar-tab-ingresar"
          onClick={() => handleModeChange("ingresar")}
          className={`type-label-md touch-target inline-flex items-center justify-center gap-1.5 rounded-lg px-space-sm btn-3d ${
            mode === "ingresar" ? "btn-3d--primary" : "btn-3d--soft"
          }`}
        >
          <Icon name="chat" filled={mode === "ingresar"} size={18} />
          <span>Ya tengo perfil</span>
        </button>
      </div>

      <InstantAuthCard
        mode={mode}
        onModeChange={handleModeChange}
        onSuccess={() => router.replace("/")}
      />
    </div>
  );
}

export default function EntrarPage() {
  return (
    <Suspense
      fallback={
        <div className="py-space-lg text-center type-body-md text-on-surface-variant">
          Cargando...
        </div>
      }
    >
      <EntrarContent />
    </Suspense>
  );
}

