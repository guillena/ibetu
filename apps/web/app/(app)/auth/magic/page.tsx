"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { MascotImage } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  apiFetch,
  buildFallbackWhatsappLoginUrl,
  fetchWhatsappLoginUrl,
  saveStoredSession,
  type StoredSession,
} from "@/lib/api";

function MagicLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { setSession } = useShell();

  const consumedTokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(
    token ? null : "El enlace mágico no contiene un código válido.",
  );
  const [whatsappUrl, setWhatsappUrl] = useState<string>(
    buildFallbackWhatsappLoginUrl(),
  );

  useEffect(() => {
    void fetchWhatsappLoginUrl().then((res) => {
      if (res?.whatsappUrl) setWhatsappUrl(res.whatsappUrl);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    if (consumedTokenRef.current === token) return;
    consumedTokenRef.current = token;

    apiFetch<StoredSession>("/auth/magic-login", {
      method: "POST",
      token: null,
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        saveStoredSession(res);
        setSession(res);
        router.replace("/");
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "El enlace mágico venció o ya fue utilizado.",
        );
      });
  }, [token, router, setSession]);

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-[var(--shell-max-w)] flex-col items-center justify-center gap-space-md py-space-lg">
      <section
        data-testid="magic-login-card"
        className="flex w-full flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2"
      >
        <MascotImage character="dadi" size={112} />

        {!error ? (
          <>
            <h1 className="type-title-lg text-ink-navy-deep">
              Abriendo tu cuenta...
            </h1>
            <p className="type-body-md text-on-surface-variant">
              Estamos validando tu enlace mágico de WhatsApp.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-space-xs">
              <h1
                data-testid="magic-login-error-title"
                className="type-title-lg text-ink-navy-deep"
              >
                No pudimos abrir tu sesión
              </h1>
              <p
                role="alert"
                data-testid="magic-login-error"
                className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
              >
                {error}
              </p>
              <p className="type-body-md mt-1 text-on-surface-variant">
                Los enlaces mágicos duran 10 minutos y funcionan una sola vez.
                Pedí uno nuevo por WhatsApp en un toque:
              </p>
            </div>

            <div className="flex w-full flex-col gap-space-xs">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="magic-retry-wsp"
                className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--success"
              >
                <Icon name="chat" filled size={20} />
                <span>Pedir un nuevo enlace por WhatsApp</span>
              </a>

              <Link
                href="/entrar?modo=nuevo"
                data-testid="magic-go-new-profile"
                className="type-label-md touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--soft"
              >
                <span>Soy nuevo, quiero crear mi perfil</span>
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function MagicLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-space-lg text-center type-body-md text-on-surface-variant">
          Validando acceso...
        </div>
      }
    >
      <MagicLoginContent />
    </Suspense>
  );
}

