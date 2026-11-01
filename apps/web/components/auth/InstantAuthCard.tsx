"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useShell } from "@/components/shell/shell-context";
import { ApiError, apiFetch, type StoredSession } from "@/lib/api";

interface InstantAuthCardProps {
  inviteCode?: string;
  onSuccess?: (session: StoredSession) => void;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
}

export function InstantAuthCard({
  inviteCode,
  onSuccess,
  title = "Creá tu perfil en 5 segundos",
  subtitle = "Recibís 50 monedas de regalo para empezar a desafiar a tus amigos.",
  submitLabel = "Entrar y recibir +50 monedas",
}: InstantAuthCardProps) {
  const { setSession } = useShell();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        )}

        <button
          type="submit"
          disabled={loading}
          className="type-label-lg touch-target mt-1 inline-flex items-center justify-center gap-space-xs rounded-lg bg-primary-container px-space-md text-on-primary shadow-level-3 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Icon name="bolt" filled size={20} />
          <span>{loading ? "Entrando..." : submitLabel}</span>
        </button>
      </form>
    </section>
  );
}

