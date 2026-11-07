"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { InstantAuthCard } from "@/components/auth/InstantAuthCard";
import { useShell } from "@/components/shell/shell-context";

function EntrarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useShell();

  const isReturning = searchParams.get("modo") === "ingresar";

  useEffect(() => {
    if (session?.accessToken) {
      router.replace("/");
    }
  }, [session?.accessToken, router]);

  if (session?.accessToken) {
    return null;
  }

  return (
    <div data-testid="entrar-page" className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">
          {isReturning ? "Volvé a tu cuenta" : "Empezá a jugar"}
        </h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          {isReturning
            ? "Elegí Google o Apple para recuperar tus monedas, amigos y retos al instante."
            : "Ingresá con Google o Apple, confirmá tu @usuario y recibí +100 monedas de regalo."}
        </p>
      </div>

      <InstantAuthCard onSuccess={() => router.replace("/")} />
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
