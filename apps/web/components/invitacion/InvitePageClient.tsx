"use client";

import Image from "next/image";
import { MascotImage } from "@/components/ui/EmptyState";
import { MASCOT_ALT } from "@/lib/brand";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  ApiError,
  apiFetch,
  buildOAuthTokenForEmail,
  completeOAuthProfile,
  getKnownOAuthAccounts,
  getStoredSession,
  type KnownOAuthAccount,
  normalizeOAuthEmail,
  type OAuthProvider,
  saveKnownOAuthAccount,
  saveStoredSession,
  subscribeSession,
  type CurrencyMode,
  type FairPlayBand,
  type StoredSession,
  verifyOAuth,
} from "@/lib/api";

export interface PublicInviteChallenge {
  id: string;
  inviteCode: string;
  title: string;
  status: string;
  mode: CurrencyMode;
  stakeAmount: number;
  pot: number | null;
  expiresAt: string;
  createdAt: string;
  shareUrl: string;
  creator: {
    id: string;
    username: string;
    displayName: string;
    credibility: {
      score: number;
      band: FairPlayBand;
      provisional: boolean;
    };
  };
  opponent: {
    id: string;
    username: string;
    displayName: string;
    credibility: {
      score: number;
      band: FairPlayBand;
      provisional: boolean;
    };
  } | null;
}

interface PendingInviteOnboarding {
  onboardingToken: string;
  provider: OAuthProvider;
  email: string;
}

function getServerSession(): StoredSession | null {
  return null;
}

export function InvitePageClient({
  code,
  initialChallenge,
}: {
  code: string;
  initialChallenge: PublicInviteChallenge | null;
}) {
  const session = useSyncExternalStore(
    subscribeSession,
    getStoredSession,
    getServerSession,
  );

  const [challenge, setChallenge] = useState<PublicInviteChallenge | null>(
    initialChallenge,
  );
  const [loadingChallenge, setLoadingChallenge] = useState(!initialChallenge);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado del selector de cuenta OAuth (Google / Apple) y confirmación de @usuario
  const [selectedProvider, setSelectedProvider] =
    useState<OAuthProvider | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [knownAccounts, setKnownAccounts] = useState<KnownOAuthAccount[]>([]);

  const [pendingOnboarding, setPendingOnboarding] =
    useState<PendingInviteOnboarding | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setKnownAccounts(getKnownOAuthAccounts());
  }, [session]);

  useEffect(() => {
    let active = true;
    apiFetch<PublicInviteChallenge>(
      `/challenges/by-code/${encodeURIComponent(code)}`,
      { token: null },
    )
      .then((res) => {
        if (!active) return;
        setChallenge(res);
        setLoadError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (!initialChallenge) {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "No encontramos esta invitación.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingChallenge(false);
      });
    return () => {
      active = false;
    };
  }, [code, initialChallenge]);

  async function acceptChallengeWithSession(activeSession: StoredSession) {
    if (
      !challenge ||
      challenge.status !== "PENDING" ||
      challenge.creator.id === activeSession.user.id
    ) {
      return;
    }

    await apiFetch(`/challenges/${challenge.id}/accept`, {
      method: "POST",
      token: activeSession.accessToken,
    });
    setAccepted(true);
    setChallenge({
      ...challenge,
      status: "ACTIVE",
      opponent: {
        id: activeSession.user.id,
        username: activeSession.user.username,
        displayName: activeSession.user.displayName,
        credibility: {
          score: activeSession.user.credibilityScore ?? 100,
          band: activeSession.user.credibilityStatus ?? "GREEN",
          provisional: true,
        },
      },
    });
  }

  function handleOpenProviderSelector(provider: OAuthProvider) {
    setAuthError(null);
    setSuggestions([]);
    setSelectedProvider(provider);
    const providerAccounts = getKnownOAuthAccounts(provider);
    setKnownAccounts(getKnownOAuthAccounts());
    if (providerAccounts.length > 0 && !accountEmail) {
      setAccountEmail(providerAccounts[0].email);
    }
  }

  async function handleVerifyWithEmail(
    provider: OAuthProvider,
    rawEmail: string,
    displayNameHint?: string,
  ) {
    setAuthError(null);
    setSuggestions([]);

    const normalizedEmail = normalizeOAuthEmail(provider, rawEmail);
    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setAuthError(
        provider === "GOOGLE"
          ? "Ingresá tu correo de Google (ej: guillena@gmail.com)."
          : "Ingresá tu correo de Apple (ej: guillena@icloud.com).",
      );
      return;
    }

    setLoadingProvider(provider);
    try {
      const idToken = buildOAuthTokenForEmail(
        provider,
        normalizedEmail,
        displayNameHint,
      );
      const res = await verifyOAuth(provider, idToken, displayNameHint);
      if (res.status === "AUTHENTICATED") {
        const loggedInSession: StoredSession = {
          accessToken: res.accessToken,
          user: {
            ...res.user,
            email: res.user.email ?? normalizedEmail,
          },
        };
        saveKnownOAuthAccount({
          provider,
          email: loggedInSession.user.email ?? normalizedEmail,
          displayName: loggedInSession.user.displayName,
          username: loggedInSession.user.username,
        });
        saveStoredSession(loggedInSession);
        await acceptChallengeWithSession(loggedInSession);
        return;
      }

      setPendingOnboarding({
        onboardingToken: res.onboardingToken,
        provider: res.provider,
        email: res.email || normalizedEmail,
      });
      setDisplayName(res.suggestedDisplayName);
      setUsername(res.suggestedUsername);
    } catch (err) {
      if (err instanceof ApiError) {
        setAuthError(err.message);
      } else {
        setAuthError("No pudimos iniciar sesión. Intentá de nuevo.");
      }
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleSubmitEmailForm(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProvider) return;
    await handleVerifyWithEmail(selectedProvider, accountEmail);
  }

  async function handleConfirmProfileAndAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingOnboarding) return;

    setAuthError(null);
    setSuggestions([]);

    const cleanName = displayName.trim();
    const cleanUser = username.trim().replace(/^@/, "").toLowerCase();

    if (cleanName.length < 2) {
      setAuthError("Ingresá tu nombre o apodo (al menos 2 letras).");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUser)) {
      setAuthError(
        "El @usuario debe tener entre 3 y 20 letras, números o guiones bajos.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const reg = await completeOAuthProfile({
        onboardingToken: pendingOnboarding.onboardingToken,
        displayName: cleanName,
        username: cleanUser,
        inviteCode: code,
      });
      const fullSession: StoredSession = {
        accessToken: reg.accessToken,
        user: {
          ...reg.user,
          email: reg.user.email ?? pendingOnboarding.email,
        },
      };
      saveKnownOAuthAccount({
        provider: pendingOnboarding.provider,
        email: pendingOnboarding.email,
        displayName: fullSession.user.displayName,
        username: fullSession.user.username,
      });
      saveStoredSession(fullSession);
      await acceptChallengeWithSession(fullSession);
    } catch (err) {
      if (err instanceof ApiError) {
        setAuthError(err.message);
        const sug = err.data?.suggestions;
        if (Array.isArray(sug)) {
          setSuggestions(sug.filter((s): s is string => typeof s === "string"));
        }
      } else {
        setAuthError("No se pudo completar el registro.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptExistingUser() {
    if (!challenge || !session) return;
    setSubmitting(true);
    setAuthError(null);
    try {
      await apiFetch(`/challenges/${challenge.id}/accept`, {
        method: "POST",
        token: session.accessToken,
      });
      setAccepted(true);
      setChallenge({ ...challenge, status: "ACTIVE" });
    } catch (err) {
      setAuthError(
        err instanceof ApiError ? err.message : "No se pudo aceptar el reto.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSwitchAccountFromInvite() {
    setAuthError(null);
    setPendingOnboarding(null);
    setSelectedProvider(null);
    saveStoredSession(null);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[var(--shell-max-w)] flex-col gap-space-md px-margin py-space-lg">
      {/* Encabezado de marca */}
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-space-xs">
          <Image
            src="/brand/mascot.png"
            alt={MASCOT_ALT}
            width={40}
            height={40}
            priority
            className="h-10 w-10 object-contain drop-shadow-sm"
          />
          <span className="type-headline-sm text-ink-navy-deep">I Bet U</span>
        </Link>
        <span className="type-label-md rounded-full bg-surface-sky-tint px-3 py-1 text-primary">
          Invitación #{code}
        </span>
      </div>

      {/* Zorro da la bienvenida sobre la tarjeta del reto */}
      {challenge ? (
        <div className="flex justify-center" data-testid="invite-mascot">
          <MascotImage character="zorro" size={96} />
        </div>
      ) : null}

      {/* Tarjeta principal del desafío */}
      {challenge ? (
        <section
          data-testid="invite-card"
          className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-space-xs">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary">
                <Icon name="person" filled size={20} />
              </span>
              <div>
                <p
                  data-testid="invite-creator"
                  className="type-label-lg text-ink-navy-deep"
                >
                  {challenge.creator.displayName} (@{challenge.creator.username})
                </p>
                <p className="type-label-sm text-secondary">
                  {challenge.creator.credibility.score}% Fair Play
                </p>
              </div>
            </div>

            <span
              data-testid="invite-stake-badge"
              className={`type-label-md inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                challenge.mode === "COINS"
                  ? "bg-tertiary-fixed text-on-tertiary-fixed"
                  : "bg-secondary-container text-on-secondary-container"
              }`}
            >
              <Icon
                name={challenge.mode === "COINS" ? "paid" : "payments"}
                filled
                size={16}
              />
              <span>
                {challenge.mode === "COINS"
                  ? `Pozo: ${(challenge.pot ?? challenge.stakeAmount * 2).toLocaleString("es-AR")} monedas`
                  : `Plata: $${challenge.stakeAmount.toLocaleString("es-AR")} c/u`}
              </span>
            </span>
          </div>

          <div>
            <span className="type-label-sm text-on-surface-variant">
              Te desafió a:
            </span>
            <h1
              data-testid="invite-title"
              className="type-headline-lg-mobile mt-1 text-ink-navy-deep"
            >
              {challenge.title}
            </h1>
          </div>

          <div className="flex items-center justify-between rounded-md bg-surface-sky-tint px-space-sm py-2">
            <span className="type-label-md text-on-surface-variant">
              Apuesta por jugador
            </span>
            <span className="type-label-lg text-ink-navy-deep">
              {challenge.mode === "COINS"
                ? `${challenge.stakeAmount} monedas`
                : `$${challenge.stakeAmount.toLocaleString("es-AR")}`}
            </span>
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-2">
          <MascotImage character="zorro" size={144} />
          <h1 className="type-title-lg text-ink-navy-deep">
            {loadingChallenge
              ? "Cargando desafío..."
              : loadError ?? "Invitación no disponible"}
          </h1>
        </section>
      )}

      {/* Modal / Tarjeta de Login con Google o Apple o Aceptación Directa */}
      {!session ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="instant-modal-title"
          data-testid="invite-register-modal"
          className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-2"
        >
          <div className="flex items-start gap-space-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
              <Icon name="redeem" filled size={22} />
            </span>
            <div>
              <h2
                id="instant-modal-title"
                className="type-title-md text-ink-navy-deep"
              >
                {pendingOnboarding
                  ? "Confirmá tu @usuario y aceptá el reto"
                  : selectedProvider
                    ? `Elegí tu cuenta de ${selectedProvider === "GOOGLE" ? "Google" : "Apple"}`
                    : "Entrá con Google o Apple para aceptar el reto"}
              </h2>
              <p className="type-body-md mt-0.5 text-on-surface-variant">
                {pendingOnboarding ? (
                  <>
                    Asociado a tu cuenta:{" "}
                    <strong
                      data-testid="invite-oauth-email"
                      className="text-ink-navy-deep"
                    >
                      {pendingOnboarding.email}
                    </strong>
                    . Recibís <strong>100 monedas gratis</strong> para jugar.
                  </>
                ) : selectedProvider ? (
                  <>
                    Seleccioná una cuenta de este navegador o ingresá tu correo
                    para asociarlo a tu perfil.
                  </>
                ) : (
                  <>
                    Sumás monedas y retos en tu cuenta. Si es tu primera vez, te
                    acreditamos <strong>100 monedas gratis</strong> al instante.
                  </>
                )}
              </p>
            </div>
          </div>

          {!pendingOnboarding && !selectedProvider ? (
            <div className="flex flex-col gap-space-xs">
              {authError && (
                <div
                  role="alert"
                  data-testid="invite-auth-error"
                  className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
                >
                  {authError}
                </div>
              )}

              {knownAccounts.length > 0 && (
                <div
                  data-testid="invite-known-accounts"
                  className="mb-1 flex flex-col gap-space-xs"
                >
                  <span className="type-label-sm text-on-surface-variant">
                    Cuentas guardadas en este navegador:
                  </span>
                  {knownAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={loadingProvider !== null}
                      data-testid={`oauth-known-account-${acc.email}`}
                      onClick={() =>
                        void handleVerifyWithEmail(
                          acc.provider,
                          acc.email,
                          acc.displayName,
                        )
                      }
                      className="touch-target flex items-center justify-between rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-left transition-colors hover:bg-surface-sky-subtle"
                    >
                      <div className="flex items-center gap-space-xs">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
                          <Icon name="person" filled size={18} />
                        </span>
                        <div>
                          <p className="type-label-lg text-ink-navy-deep">
                            {acc.displayName}
                            {acc.username ? ` (@${acc.username})` : ""}
                          </p>
                          <p className="type-label-sm text-on-surface-variant">
                            {acc.email}
                          </p>
                        </div>
                      </div>
                      <Icon
                        name="chevron_right"
                        size={18}
                        className="text-primary"
                      />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={loadingProvider !== null}
                onClick={() => handleOpenProviderSelector("GOOGLE")}
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
                onClick={() => handleOpenProviderSelector("APPLE")}
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
          ) : !pendingOnboarding && selectedProvider ? (
            <div
              data-testid="oauth-account-selector"
              className="flex flex-col gap-space-sm"
            >
              {knownAccounts
                .filter((a) => a.provider === selectedProvider)
                .map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={loadingProvider !== null}
                    data-testid={`oauth-known-account-${acc.email}`}
                    onClick={() =>
                      void handleVerifyWithEmail(
                        selectedProvider,
                        acc.email,
                        acc.displayName,
                      )
                    }
                    className="touch-target flex items-center justify-between rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-left transition-colors hover:bg-surface-sky-subtle"
                  >
                    <div className="flex items-center gap-space-xs">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
                        <Icon name="person" filled size={18} />
                      </span>
                      <div>
                        <p className="type-label-lg text-ink-navy-deep">
                          {acc.displayName}
                          {acc.username ? ` (@${acc.username})` : ""}
                        </p>
                        <p className="type-label-sm text-on-surface-variant">
                          {acc.email}
                        </p>
                      </div>
                    </div>
                    <Icon
                      name="chevron_right"
                      size={18}
                      className="text-primary"
                    />
                  </button>
                ))}

              <form
                onSubmit={handleSubmitEmailForm}
                noValidate
                className="flex flex-col gap-space-sm"
              >
                <div>
                  <label
                    htmlFor="oauth-account-email"
                    className="type-label-md block text-ink-navy-deep"
                  >
                    Tu correo de{" "}
                    {selectedProvider === "GOOGLE" ? "Google" : "Apple"}
                  </label>
                  <input
                    id="oauth-account-email"
                    data-testid="oauth-email-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder={
                      selectedProvider === "GOOGLE"
                        ? "Ej: guillena@gmail.com"
                        : "Ej: guillena@icloud.com"
                    }
                    value={accountEmail}
                    onChange={(e) => {
                      setAccountEmail(e.target.value);
                      setAuthError(null);
                    }}
                    className="type-body-md mt-1 w-full rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-container"
                  />
                </div>

                {authError && (
                  <div
                    role="alert"
                    data-testid="invite-auth-error"
                    className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
                  >
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loadingProvider !== null}
                  data-testid="btn-oauth-email-continue"
                  className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
                >
                  <Icon name="login" size={20} />
                  <span>
                    {loadingProvider
                      ? "Conectando..."
                      : `Continuar con ${selectedProvider === "GOOGLE" ? "Google" : "Apple"}`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setAuthError(null);
                  }}
                  data-testid="btn-back-to-providers"
                  className="type-label-md mt-1 text-center text-on-surface-variant hover:underline"
                >
                  Volver a elegir Google o Apple
                </button>
              </form>
            </div>
          ) : (
            <form
              onSubmit={handleConfirmProfileAndAccept}
              noValidate
              className="flex flex-col gap-space-sm"
            >
              <div>
                <label
                  htmlFor="invite-display-name"
                  className="type-label-md block text-ink-navy-deep"
                >
                  Tu nombre
                </label>
                <input
                  id="invite-display-name"
                  type="text"
                  placeholder="Ej: Guillena"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="type-body-md mt-1 w-full rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep focus:outline-2 focus:outline-primary-container"
                />
              </div>

              <div>
                <label
                  htmlFor="invite-username"
                  className="type-label-md block text-ink-navy-deep"
                >
                  Confirmá tu @usuario único
                </label>
                <div className="relative mt-1 flex items-center">
                  <span className="type-label-lg pointer-events-none absolute left-3 text-on-surface-variant">
                    @
                  </span>
                  <input
                    id="invite-username"
                    type="text"
                    placeholder="guillena"
                    value={username}
                    onChange={(e) =>
                      setUsername(
                        e.target.value.replace(/^@/, "").toLowerCase(),
                      )
                    }
                    className="type-body-md w-full rounded-md bg-surface-sky-tint py-2.5 pr-space-sm pl-8 text-ink-navy-deep focus:outline-2 focus:outline-primary-container"
                  />
                </div>
              </div>

              {authError && (
                <div
                  role="alert"
                  data-testid="invite-auth-error"
                  className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
                >
                  {authError}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="type-label-sm text-on-surface-variant">
                    Sugerencias:
                  </span>
                  {suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setUsername(sug);
                        setAuthError(null);
                      }}
                      className="type-label-md rounded-full bg-surface-sky-tint px-2.5 py-1 text-primary"
                    >
                      @{sug}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                data-testid="invite-register-submit"
                className="type-label-lg touch-target mt-1 inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
              >
                <Icon name="bolt" filled size={20} />
                <span>
                  {submitting
                    ? "Procesando..."
                    : "Confirmar @usuario, recibir +100 monedas y Aceptar Reto"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingOnboarding(null);
                  setAuthError(null);
                  setSuggestions([]);
                }}
                className="type-label-md mt-1 text-center text-on-surface-variant hover:underline"
              >
                Elegir otra cuenta de Google o Apple
              </button>
            </form>
          )}
        </section>
      ) : (
        <section
          data-testid="invite-authenticated-box"
          className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-2"
        >
          {authError && (
            <div
              role="alert"
              className="type-body-md rounded-md bg-error-container px-space-sm py-2 text-on-error-container"
            >
              {authError}
            </div>
          )}

          {accepted || challenge?.status === "ACTIVE" ? (
            <div
              data-testid="invite-accepted-banner"
              className="flex flex-col gap-space-sm"
            >
              <div className="flex items-center gap-space-xs text-secondary">
                <Icon name="check_circle" filled size={24} />
                <span className="type-title-md text-ink-navy-deep">
                  ¡Reto aceptado! El pozo ya quedó en juego.
                </span>
              </div>
              {challenge && (
                <Link
                  href={`/retos/${challenge.id}`}
                  data-testid="invite-go-detail"
                  className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
                >
                  <span>Ir al Detalle del Reto</span>
                  <Icon name="chevron_right" size={18} />
                </Link>
              )}
            </div>
          ) : (
            challenge &&
            challenge.creator.id !== session.user.id && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleAcceptExistingUser}
                data-testid="accept-invite-btn"
                className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md btn-3d btn-3d--primary"
              >
                <Icon name="sports_score" filled size={20} />
                <span>
                  {submitting ? "Aceptando..." : "Aceptar Reto ahora"}
                </span>
              </button>
            )
          )}

          <div
            data-testid="invite-current-account"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sky-tint px-space-sm py-2"
          >
            <div className="text-left">
              <p className="type-label-md text-ink-navy-deep">
                Conectado como{" "}
                <strong>
                  {session.user.displayName} (@{session.user.username})
                </strong>
              </p>
              {session.user.email && (
                <p className="type-label-sm text-on-surface-variant">
                  {session.user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSwitchAccountFromInvite}
              data-testid="invite-switch-account-btn"
              className="type-label-md inline-flex items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1 text-primary shadow-level-1 hover:underline"
            >
              <Icon name="swap_horiz" size={16} />
              <span>Cambiar cuenta</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
