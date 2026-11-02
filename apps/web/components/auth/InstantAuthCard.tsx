"use client";

import { useEffect, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { MascotImage } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  apiFetch,
  buildFallbackWhatsappLoginUrl,
  fetchWhatsappLoginUrl,
  type StoredSession,
} from "@/lib/api";

export type AuthCardMode = "nuevo" | "ingresar";

interface InstantAuthCardProps {
  inviteCode?: string;
  onSuccess?: (session: StoredSession) => void;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  initialMode?: AuthCardMode;
  mode?: AuthCardMode;
  onModeChange?: (mode: AuthCardMode) => void;
}

export function InstantAuthCard({
  inviteCode,
  onSuccess,
  title = "Creá tu perfil en 5 segundos",
  subtitle = "Recibís 50 monedas de regalo para empezar a desafiar a tus amigos.",
  submitLabel = "Entrar y recibir +50 monedas",
  initialMode = "nuevo",
  mode: controlledMode,
  onModeChange,
}: InstantAuthCardProps) {
  const { setSession } = useShell();
  const [internalMode, setInternalMode] = useState<AuthCardMode>(initialMode);
  const activeMode = controlledMode ?? internalMode;

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string>(
    buildFallbackWhatsappLoginUrl(),
  );

  useEffect(() => {
    let active = true;
    void fetchWhatsappLoginUrl().then((res) => {
      if (active && res?.whatsappUrl) {
        setWhatsappUrl(res.whatsappUrl);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function switchMode(next: AuthCardMode) {
    setInternalMode(next);
    onModeChange?.(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuggestions([]);

    const cleanName = displayName.trim();
    const cleanUser = username.trim().replace(/^@/, "").toLowerCase();

    if (cleanName.length < 2) {
      setError("Ingresá tu nombre o apodo (al menos 2 letras).");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUser)) {
      setError("El @usuario debe tener entre 3 y 20 letras, números o guiones bajos.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<StoredSession>("/auth/instant-register", {
        method: "POST",
        body: JSON.stringify({
          displayName: cleanName,
          username: cleanUser,
          ...(inviteCode ? { inviteCode } : {}),
        }),
      });
      setSession(res);
      onSuccess?.(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const sug = err.data?.suggestions;
        if (Array.isArray(sug)) {
          setSuggestions(sug.filter((s): s is string => typeof s === "string"));
        }
      } else {
        setError("No pudimos crear tu perfil. Intentá de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (activeMode === "ingresar") {
    return (
      <section
        data-testid="returning-auth-card"
        className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex items-start gap-space-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <Icon name="chat" filled size={22} />
          </span>
          <div>
            <h2 className="type-title-md text-ink-navy-deep">
              Entrá a tu perfil con WhatsApp
            </h2>
            <p className="type-body-md mt-0.5 text-on-surface-variant">
              Sin contraseñas: mandale un mensaje al bot desde tu número
              vinculado y te responde al instante con tu enlace mágico de acceso.
            </p>
          </div>
        </div>

        <div className="flex justify-center py-1">
          <MascotImage character="dadi" size={88} />
        </div>

        <ol className="type-body-md flex flex-col gap-1.5 rounded-md bg-surface-sky-tint p-space-sm text-ink-navy-deep">
          <li>1. Tocá el botón verde para abrir el chat oficial en WhatsApp.</li>
          <li>2. Enviá el mensaje que ya viene escrito.</li>
          <li>3. Tocá el enlace que te responde el bot y entrás directo.</li>
        </ol>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="btn-login-whatsapp"
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--success"
        >
          <Icon name="chat" filled size={20} />
          <span>Entrar con mi WhatsApp</span>
        </a>

        <div className="border-t border-surface-sky-subtle pt-space-sm text-center">
          <button
            type="button"
            onClick={() => switchMode("nuevo")}
            data-testid="btn-switch-to-register"
            className="type-label-md text-primary hover:underline"
          >
            ¿Todavía no tenés cuenta? Creá tu perfil (+50 monedas)
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="instant-auth-card"
      className="rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
    >
      <div className="flex items-start gap-space-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
          <Icon name="redeem" filled size={22} />
        </span>
        <div>
          <h2 className="type-title-md text-ink-navy-deep">{title}</h2>
          <p className="type-body-md mt-0.5 text-on-surface-variant">{subtitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-space-md flex flex-col gap-space-sm" noValidate>
        <div>
          <label htmlFor="auth-display-name" className="type-label-md block text-ink-navy-deep">
            Tu nombre o apodo
          </label>
          <input
            id="auth-display-name"
            type="text"
            maxLength={40}
            placeholder="Ej: Martín"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="type-body-md mt-1 w-full rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-container"
          />
        </div>

        <div>
          <label htmlFor="auth-username" className="type-label-md block text-ink-navy-deep">
            Tu @usuario único
          </label>
          <div className="relative mt-1 flex items-center">
            <span className="type-label-lg pointer-events-none absolute left-3 text-on-surface-variant">
              @
            </span>
            <input
              id="auth-username"
              type="text"
              maxLength={20}
              placeholder="martin_ok"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, "").toLowerCase())}
              className="type-body-md w-full rounded-md bg-surface-sky-tint py-2.5 pr-space-sm pl-8 text-ink-navy-deep placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-container"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
          >
            {error}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-space-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-label-sm text-on-surface-variant">Disponibles:</span>
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => {
                    setUsername(sug);
                    setError(null);
                  }}
                  className="type-label-md rounded-full bg-surface-sky-tint px-2.5 py-1 text-primary hover:bg-surface-sky-subtle"
                >
                  @{sug}
                </button>
              ))}
            </div>
            <p className="type-label-sm text-on-surface-variant">
              ¿Ese @usuario ya es tuyo?{" "}
              <button
                type="button"
                onClick={() => switchMode("ingresar")}
                data-testid="conflict-switch-login"
                className="font-bold text-primary underline"
              >
                Entrá con tu WhatsApp
              </button>
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="type-label-lg touch-target mt-1 inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
        >
          <Icon name="bolt" filled size={20} />
          <span>{loading ? "Entrando..." : submitLabel}</span>
        </button>

        <div className="mt-1 border-t border-surface-sky-subtle pt-space-sm text-center">
          <button
            type="button"
            onClick={() => switchMode("ingresar")}
            data-testid="btn-switch-to-login"
            className="type-label-md text-primary hover:underline"
          >
            ¿Ya tenés perfil? Entrá con tu WhatsApp
          </button>
        </div>
      </form>
    </section>
  );
}
