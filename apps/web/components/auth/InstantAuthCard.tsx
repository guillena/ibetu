"use client";

import { useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { MascotImage } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  completeOAuthProfile,
  type OAuthProvider,
  saveStoredSession,
  type StoredSession,
  verifyOAuth,
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

interface PendingOnboarding {
  onboardingToken: string;
  provider: OAuthProvider;
  email: string;
}

export function InstantAuthCard({
  inviteCode,
  onSuccess,
  title = "Entrá con Google o Apple",
  subtitle = "Elegí tu cuenta para entrar. Si es tu primera vez, confirmás tu @usuario y recibís +100 monedas de regalo.",
  submitLabel = "Confirmar @usuario y recibir +100 monedas",
}: InstantAuthCardProps) {
  const { setSession } = useShell();

  const [pendingOnboarding, setPendingOnboarding] =
    useState<PendingOnboarding | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const [submittingProfile, setSubmittingProfile] = useState(false);

  async function handleSelectProvider(provider: OAuthProvider) {
    setError(null);
    setSuggestions([]);
    setLoadingProvider(provider);

    try {
      const res = await verifyOAuth(provider);
      if (res.status === "AUTHENTICATED") {
        const session: StoredSession = {
          accessToken: res.accessToken,
          user: res.user,
        };
        saveStoredSession(session);
        setSession(session);
        onSuccess?.(session);
        return;
      }

      setPendingOnboarding({
        onboardingToken: res.onboardingToken,
        provider: res.provider,
        email: res.email,
      });
      setDisplayName(res.suggestedDisplayName);
      setUsername(res.suggestedUsername);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No pudimos iniciar sesión. Intentá de nuevo.");
      }
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleConfirmProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingOnboarding) return;

    setError(null);
    setSuggestions([]);

    const cleanName = displayName.trim();
    const cleanUser = username.trim().replace(/^@/, "").toLowerCase();

    if (cleanName.length < 2) {
      setError("Ingresá tu nombre o apodo (al menos 2 letras).");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUser)) {
      setError(
        "El @usuario debe tener entre 3 y 20 letras, números o guiones bajos.",
      );
      return;
    }

    setSubmittingProfile(true);
    try {
      const session = await completeOAuthProfile({
        onboardingToken: pendingOnboarding.onboardingToken,
        displayName: cleanName,
        username: cleanUser,
        ...(inviteCode ? { inviteCode } : {}),
      });
      saveStoredSession(session);
      setSession(session);
      onSuccess?.(session);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const sug = err.data?.suggestions;
        if (Array.isArray(sug)) {
          setSuggestions(sug.filter((s): s is string => typeof s === "string"));
        }
      } else {
        setError("No pudimos confirmar tu perfil. Intentá de nuevo.");
      }
    } finally {
      setSubmittingProfile(false);
    }
  }

  if (pendingOnboarding) {
    return (
      <section
        data-testid="oauth-confirm-profile-card"
        className="rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
      >
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-start gap-space-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
              <Icon name="verified_user" filled size={22} />
            </span>
            <div>
              <h2 className="type-title-md text-ink-navy-deep">
                Confirmá tu @usuario para empezar
              </h2>
              <p className="type-body-md mt-0.5 text-on-surface-variant">
                Cuenta conectada:{" "}
                <strong data-testid="oauth-connected-email">
                  {pendingOnboarding.email}
                </strong>
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleConfirmProfile}
          className="mt-space-md flex flex-col gap-space-sm"
          noValidate
        >
          <div>
            <label
              htmlFor="auth-display-name"
              className="type-label-md block text-ink-navy-deep"
            >
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
            <label
              htmlFor="auth-username"
              className="type-label-md block text-ink-navy-deep"
            >
              Confirmá tu @usuario único
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
                onChange={(e) =>
                  setUsername(e.target.value.replace(/^@/, "").toLowerCase())
                }
                className="type-body-md w-full rounded-md bg-surface-sky-tint py-2.5 pr-space-sm pl-8 text-ink-navy-deep placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-container"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="oauth-profile-error"
              className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
            >
              {error}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-label-sm text-on-surface-variant">
                Disponibles:
              </span>
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  data-testid={`username-suggestion-${sug}`}
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
            disabled={submittingProfile}
            data-testid="btn-confirm-profile"
            className="type-label-lg touch-target mt-1 inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
          >
            <Icon name="bolt" filled size={20} />
            <span>{submittingProfile ? "Confirmando..." : submitLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingOnboarding(null);
              setError(null);
              setSuggestions([]);
            }}
            data-testid="btn-change-oauth-provider"
            className="type-label-md mt-1 text-center text-on-surface-variant hover:underline"
          >
            Cambiar cuenta de Google o Apple
          </button>
        </form>
      </section>
    );
  }

  return (
    <section
      data-testid="instant-auth-card"
      className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
    >
      <div className="flex items-start gap-space-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
          <Icon name="redeem" filled size={22} />
        </span>
        <div>
          <h2 className="type-title-md text-ink-navy-deep">{title}</h2>
          <p className="type-body-md mt-0.5 text-on-surface-variant">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <MascotImage character="dadi" size={84} />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="oauth-verify-error"
          className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-space-xs">
        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => void handleSelectProvider("GOOGLE")}
          data-testid="btn-oauth-google"
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
        >
          <Icon name="mail" filled size={20} />
          <span>
            {loadingProvider === "GOOGLE"
              ? "Conectando con Google..."
              : "Continuar con Google"}
          </span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => void handleSelectProvider("APPLE")}
          data-testid="btn-oauth-apple"
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--soft"
        >
          <Icon name="verified_user" filled size={20} />
          <span>
            {loadingProvider === "APPLE"
              ? "Conectando con Apple..."
              : "Continuar con Apple"}
          </span>
        </button>
      </div>
    </section>
  );
}
