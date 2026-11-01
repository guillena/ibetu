"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InstantAuthCard } from "@/components/auth/InstantAuthCard";
import { useShell, type CurrencyMode } from "@/components/shell/shell-context";
import {
  ApiError,
  apiFetch,
  type ChallengePreset,
  type FriendItem,
} from "@/lib/api";

const DEFAULT_PRESETS: ChallengePreset[] = [
  {
    id: "paper-basket",
    label: "Emboque de papel",
    text: "¿A que no embocás el papel en el cesto de 5 metros al primer intento?",
  },
  {
    id: "corner-kick",
    label: "Pique a la esquina",
    text: "¿A que no llegás primero a la esquina?",
  },
  {
    id: "ping-pong",
    label: "1v1 Ping Pong",
    text: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
  },
  {
    id: "pizza",
    label: "Mejor Pizza Casera",
    text: "¿Quién prepara la mejor pizza casera?",
  },
  {
    id: "pushups",
    label: "30 flexiones",
    text: "¿Quién hace 30 flexiones más rápido?",
  },
  {
    id: "fifa",
    label: "FIFA 1v1",
    text: "Partida de FIFA 1v1 sin repetir equipo.",
  },
];

const COINS_QUICK = [10, 25, 50];
const CASH_QUICK = [1000, 2500, 5000];

const DURATION_OPTIONS = [
  { hours: 24, label: "24 horas" },
  { hours: 48, label: "48 horas" },
  { hours: 168, label: "7 días" },
];

interface CreatedChallengeResponse {
  id: string;
  inviteCode: string;
  title: string;
  status: string;
  mode: CurrencyMode;
  stakeAmount: number;
  expiresAt: string;
  shareUrl: string;
  whatsappShareUrl: string;
}

export function CrearRetoForm() {
  const { mode, setMode, coins, session } = useShell();

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [presets, setPresets] = useState<ChallengePreset[]>(DEFAULT_PRESETS);

  // Bloque 1: Rival (null = link de WhatsApp, string = ID de amigo)
  const [opponentId, setOpponentId] = useState<string | null>(null);

  // Bloque 2: Descripción y preset
  const [title, setTitle] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Bloque 3: Apuesta y vencimiento
  const [stakeInput, setStakeInput] = useState<string>("10");
  const [durationHours, setDurationHours] = useState<number | "CUSTOM">(48);
  const [customExpiresAt, setCustomExpiresAt] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedChallengeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const opp = params.get("opponentId");
      if (opp) setOpponentId(opp);
    }
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    let active = true;
    Promise.all([
      apiFetch<FriendItem[]>("/friends", { token: session.accessToken }).catch(() => []),
      apiFetch<ChallengePreset[]>("/challenges/presets", {
        token: session.accessToken,
      }).catch(() => DEFAULT_PRESETS),
    ]).then(([loadedFriends, loadedPresets]) => {
      if (!active) return;
      setFriends(loadedFriends);
      if (loadedPresets.length > 0) setPresets(loadedPresets);
    });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  function handleModeChange(nextMode: CurrencyMode) {
    setMode(nextMode);
    setStakeInput(nextMode === "COINS" ? "10" : "1000");
    setError(null);
  }

  function handleSelectPreset(preset: ChallengePreset) {
    setSelectedPresetId(preset.id);
    setTitle(preset.text);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError("Escribí de qué trata el desafío o elegí una idea rápida.");
      return;
    }
    if (trimmedTitle.length > 140) {
      setError("El desafío no puede superar los 140 caracteres.");
      return;
    }

    const parsedStake = Number(stakeInput);
    if (!Number.isInteger(parsedStake) || parsedStake <= 0) {
      setError("La apuesta debe ser un número entero mayor a 0.");
      return;
    }

    const availableCoins = coins ?? session?.user.coinsAvailable ?? null;
    if (mode === "COINS" && availableCoins !== null && parsedStake > availableCoins) {
      setError(
        `No tenés suficientes monedas disponibles (${availableCoins}) para esta apuesta.`,
      );
    }

    let expiresDate: Date;
    if (durationHours === "CUSTOM") {
      if (!customExpiresAt) {
        setError("Elegí una fecha y hora de vencimiento.");
        return;
      }
      expiresDate = new Date(customExpiresAt);
    } else {
      expiresDate = new Date(Date.now() + durationHours * 3_600_000);
    }

    if (Number.isNaN(expiresDate.getTime()) || expiresDate.getTime() <= Date.now()) {
      setError("La fecha de vencimiento debe ser futura.");
      return;
    }

    if (
      mode === "COINS" &&
      availableCoins !== null &&
      parsedStake > availableCoins
    ) {
      return;
    }

    if (!session?.accessToken) {
      setError("Creá tu perfil rápido arriba o abajo para enviar el reto.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<CreatedChallengeResponse>("/challenges", {
        method: "POST",
        body: JSON.stringify({
          title: trimmedTitle,
          ...(selectedPresetId ? { presetId: selectedPresetId } : {}),
          ...(opponentId ? { opponentId } : {}),
          mode,
          stakeAmount: parsedStake,
          expiresAt: expiresDate.toISOString(),
        }),
      });
      setCreated(result);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo crear el reto.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const invitePath = `/r/${created.inviteCode}`;
    const fullInviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${invitePath}`
        : created.shareUrl;

    const stakeLine =
      created.mode === "COINS"
        ? `🪙 *Pozo en juego:* ${(created.stakeAmount * 2).toLocaleString("es-AR")} monedas (${created.stakeAmount.toLocaleString("es-AR")} c/u)`
        : `💵 *Apuesta entre amigos:* $${created.stakeAmount.toLocaleString("es-AR")} c/u`;

    const formattedWhatsappText = [
      "⚡ *¡Te desafío en I Bet U!*",
      "",
      `🎯 *"${created.title}"*`,
      stakeLine,
      "",
      "👉 *Aceptá el reto acá (recibís +50 monedas gratis):*",
      fullInviteUrl,
    ].join("\n");

    const whatsappHref =
      created.whatsappShareUrl &&
      !created.whatsappShareUrl.includes("localhost")
        ? created.whatsappShareUrl
        : `https://wa.me/?text=${encodeURIComponent(formattedWhatsappText)}`;

    return (
      <div className="flex flex-col gap-space-md">
        <div>
          <h1 className="type-headline-lg-mobile text-ink-navy-deep">Crear reto</h1>
          <p className="type-body-md mt-space-xs text-on-surface-variant">
            ¡Tu desafío ya está listo para compartir!
          </p>
        </div>

        <section
          data-testid="created-challenge-card"
          className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-2"
        >
          <div className="flex items-center gap-space-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
              <Icon name="check_circle" filled size={28} />
            </span>
            <div>
              <span className="type-label-md text-secondary">Reto creado</span>
              <h2 className="type-title-lg text-ink-navy-deep">{created.title}</h2>
            </div>
          </div>

          <div className="rounded-md bg-surface-sky-tint p-space-sm">
            <span className="type-label-sm text-on-surface-variant">
              Enlace de invitación
            </span>
            <p
              data-testid="created-invite-link"
              className="type-label-lg mt-0.5 break-all text-ink-navy-deep"
            >
              {fullInviteUrl}
            </p>
          </div>

          <div className="flex flex-col gap-space-xs">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="share-whatsapp-link"
              className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg bg-secondary px-space-md text-on-primary shadow-level-3"
            >
              <Icon name="share" size={20} />
              <span>Mandar por WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  void navigator.clipboard.writeText(fullInviteUrl);
                }
                setCopied(true);
              }}
              className="type-label-md touch-target inline-flex items-center justify-center gap-space-xs rounded-lg bg-surface-sky-tint px-space-md text-ink-navy-deep"
            >
              <Icon name="content_copy" size={18} />
              <span>{copied ? "¡Enlace copiado!" : "Copiar enlace"}</span>
            </button>

            <Link
              href={`/retos/${created.id}`}
              data-testid="go-to-challenge-detail"
              className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg bg-primary-container px-space-md text-on-primary shadow-level-3"
            >
              <span>Ver Detalle del Reto</span>
              <Icon name="chevron_right" size={18} />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const numericStake = Number(stakeInput) > 0 ? Number(stakeInput) : 0;
  const quickStakes = mode === "COINS" ? COINS_QUICK : CASH_QUICK;

  return (
    <div className="flex flex-col gap-space-md">
      <div>
        <h1 className="type-headline-lg-mobile text-ink-navy-deep">Crear reto</h1>
        <p className="type-body-md mt-space-xs text-on-surface-variant">
          Elegí a tu rival, escribí el desafío y definí la apuesta en tres pasos.
        </p>
      </div>

      {!session && (
        <InstantAuthCard
          title="Antes de lanzar tu reto, creá tu perfil"
          subtitle="Te regalamos 50 monedas al instante para apostar con tus amigos."
        />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-space-md"
        data-testid="crear-reto-form"
      >
        {/* Bloque 1: Selector de amigo o link de WhatsApp */}
        <section
          data-testid="block-rival"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <div className="flex items-center gap-space-xs">
            <span className="type-label-md flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-on-primary">
              1
            </span>
            <h2 className="type-title-md text-ink-navy-deep">
              ¿Contra quién jugás?
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-space-xs">
            <button
              type="button"
              data-testid="rival-whatsapp-link"
              aria-pressed={opponentId === null}
              onClick={() => setOpponentId(null)}
              className={`touch-target flex items-center justify-between rounded-md px-space-sm py-2.5 text-left transition-colors ${
                opponentId === null
                  ? "bg-primary-container text-on-primary shadow-level-1"
                  : "bg-surface-sky-tint text-ink-navy-deep"
              }`}
            >
              <span className="flex items-center gap-space-xs">
                <Icon name="link" size={20} />
                <span className="type-label-lg">
                  Invitar por link de WhatsApp
                </span>
              </span>
              {opponentId === null && <Icon name="check_circle" filled size={20} />}
            </button>

            {friends.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5">
                <span className="type-label-sm text-on-surface-variant">
                  O elegí a uno de tus amigos:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {friends.map((friend) => {
                    const active = opponentId === friend.id;
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        data-testid={`rival-friend-${friend.id}`}
                        aria-pressed={active}
                        onClick={() => setOpponentId(friend.id)}
                        className={`type-label-md touch-target inline-flex items-center gap-1.5 rounded-full px-space-sm transition-colors ${
                          active
                            ? "bg-primary-container text-on-primary shadow-level-1"
                            : "bg-surface-sky-tint text-ink-navy-deep"
                        }`}
                      >
                        <Icon name="person" filled={active} size={18} />
                        <span>
                          {friend.displayName} (@{friend.username})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Bloque 2: Descripción y píldoras de Presets rápidos (sin botón de voz) */}
        <section
          data-testid="block-description"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="type-label-md flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-on-primary">
                2
              </span>
              <h2 className="type-title-md text-ink-navy-deep">
                ¿Cuál es el desafío?
              </h2>
            </div>
            <span
              data-testid="title-char-count"
              className={`type-label-sm ${
                title.length > 140 ? "text-error" : "text-on-surface-variant"
              }`}
            >
              {title.length}/140
            </span>
          </div>

          <div>
            <span className="type-label-sm text-on-surface-variant">
              Ideas rápidas de 1 toque:
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const selected = selectedPresetId === preset.id && title === preset.text;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid="preset-pill"
                    onClick={() => handleSelectPreset(preset)}
                    className={`type-label-md rounded-full px-3 py-1.5 transition-colors ${
                      selected
                        ? "bg-primary-container text-on-primary shadow-level-1"
                        : "bg-surface-sky-tint text-ink-navy-deep hover:bg-surface-sky-subtle"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="challenge-title" className="sr-only">
              Descripción del desafío
            </label>
            <textarea
              id="challenge-title"
              rows={3}
              placeholder="Ej: ¿A que no embocás el papel en el cesto de 5 metros al primer intento?"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              className="type-body-md w-full rounded-md bg-surface-sky-tint p-space-sm text-ink-navy-deep placeholder:text-on-surface-variant focus:outline-2 focus:outline-primary-container"
            />
          </div>
        </section>

        {/* Bloque 3: Apuesta en Monedas/Plata y fecha de vencimiento */}
        <section
          data-testid="block-stake"
          className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-2"
        >
          <div className="flex items-center gap-space-xs">
            <span className="type-label-md flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-on-primary">
              3
            </span>
            <h2 className="type-title-md text-ink-navy-deep">
              Apuesta y vencimiento
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-sky-tint p-1">
            <button
              type="button"
              data-testid="form-mode-coins"
              aria-pressed={mode === "COINS"}
              onClick={() => handleModeChange("COINS")}
              className={`type-label-md touch-target flex items-center justify-center gap-1 rounded-full transition-colors ${
                mode === "COINS"
                  ? "bg-primary-container text-on-primary shadow-level-3"
                  : "text-ink-navy-deep"
              }`}
            >
              <Icon name="paid" filled={mode === "COINS"} size={18} />
              <span>Monedas</span>
            </button>

            <button
              type="button"
              data-testid="form-mode-cash"
              aria-pressed={mode === "CASH"}
              onClick={() => handleModeChange("CASH")}
              className={`type-label-md touch-target flex items-center justify-center gap-1 rounded-full transition-colors ${
                mode === "CASH"
                  ? "bg-primary-container text-on-primary shadow-level-3"
                  : "text-ink-navy-deep"
              }`}
            >
              <Icon name="payments" filled={mode === "CASH"} size={18} />
              <span>Plata</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickStakes.map((val) => {
              const active = Number(stakeInput) === val;
              return (
                <button
                  key={val}
                  type="button"
                  data-testid={`stake-pill-${val}`}
                  onClick={() => {
                    setStakeInput(String(val));
                    setError(null);
                  }}
                  className={`type-label-md touch-target flex-1 rounded-md px-3 transition-colors ${
                    active
                      ? "bg-tertiary-fixed text-on-tertiary-fixed shadow-level-1"
                      : "bg-surface-sky-tint text-ink-navy-deep"
                  }`}
                >
                  {mode === "COINS"
                    ? `${val} monedas`
                    : `$${val.toLocaleString("es-AR")}`}
                </button>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="challenge-stake"
              className="type-label-md block text-ink-navy-deep"
            >
              {mode === "COINS"
                ? "Apuesta por jugador (monedas)"
                : "Monto acordado por jugador ($)"}
            </label>
            <input
              id="challenge-stake"
              type="number"
              min={1}
              step={1}
              value={stakeInput}
              onChange={(e) => {
                setStakeInput(e.target.value);
                setError(null);
              }}
              className="type-body-md mt-1 w-full rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep focus:outline-2 focus:outline-primary-container"
            />
            <p
              data-testid="pot-preview"
              className="type-label-sm mt-1 text-on-surface-variant"
            >
              {mode === "COINS"
                ? `Pozo total en juego: ${(numericStake * 2).toLocaleString("es-AR")} monedas (${numericStake.toLocaleString("es-AR")} cada uno).`
                : `Acuerdo directo entre amigos: $${numericStake.toLocaleString("es-AR")} por jugador.`}
            </p>
          </div>

          <div>
            <span className="type-label-md block text-ink-navy-deep">
              ¿Cuándo vence el desafío?
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  data-testid={`duration-${opt.hours}`}
                  onClick={() => {
                    setDurationHours(opt.hours);
                    setError(null);
                  }}
                  className={`type-label-md rounded-full px-3 py-1.5 ${
                    durationHours === opt.hours
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-sky-tint text-ink-navy-deep"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                data-testid="duration-custom"
                onClick={() => setDurationHours("CUSTOM")}
                className={`type-label-md rounded-full px-3 py-1.5 ${
                  durationHours === "CUSTOM"
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-sky-tint text-ink-navy-deep"
                }`}
              >
                Elegir fecha
              </button>
            </div>

            {durationHours === "CUSTOM" && (
              <div className="mt-2">
                <label htmlFor="challenge-expires" className="sr-only">
                  Fecha y hora de vencimiento
                </label>
                <input
                  id="challenge-expires"
                  type="datetime-local"
                  value={customExpiresAt}
                  onChange={(e) => {
                    setCustomExpiresAt(e.target.value);
                    setError(null);
                  }}
                  className="type-body-md w-full rounded-md bg-surface-sky-tint px-space-sm py-2.5 text-ink-navy-deep"
                />
              </div>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            data-testid="crear-reto-error"
            className="type-body-md rounded-md bg-error-container px-space-sm py-2.5 text-on-error-container"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          data-testid="submit-crear-reto"
          className="type-label-lg touch-target inline-flex items-center justify-center gap-space-xs rounded-lg bg-primary-container px-space-lg text-on-primary shadow-level-3 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Icon name="sports_score" filled size={22} />
          <span>{submitting ? "Creando reto..." : "Lanzar Reto"}</span>
        </button>
      </form>
    </div>
  );
}

